/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DATA_FOLDER, EXTENSIONS_FOLDER, INSIDERS_VSCODE_DEV_HOST_NAME, PERFORMANCE_FILE, PERFORMANCE_RUNS, Runtime, USER_DATA_FOLDER, VSCODE_DEV_HOST_NAME, RUNTIME_TRACE_FOLDER } from "./constants";
import * as fs from 'fs';
import * as cp from 'child_process';
import { join } from 'path';
import playwright from 'playwright';
import chalk from "chalk";
import { IPlaywrightStorageState } from "./types";
import { generateVscodeDevAuthState } from "./auth";

const PERFORMANCE_RUN_TIMEOUT = 60000;
const MB = 1024 * 1024;

export interface Options {
	build: string;
	runtime: Runtime;
	durationMarkers?: string[];
	durationMarkersFile?: string;
	runs?: number;
	folderToOpen?: string;
	fileToOpen?: string;
	profAppendTimers?: string;
	profAppendHeapStatistics?: boolean;
	verbose?: boolean;
	token?: string;
	runtimeTraceCategories?: string;
	disableCachedData?: boolean;
	disableTelemetry?: boolean;
}

interface ITracingData {
	readonly args?: {
		readonly usedHeapSizeAfter?: number;
		readonly usedHeapSizeBefore?: number;
	},
	readonly dur: number; 	// in microseconds
	readonly name: string;	// e.g. MinorGC or MajorGC
}

interface IGCStatistics {
	readonly used: number;
	readonly garbage: number;
	readonly majorGCs: number;
	readonly minorGCs: number;
	readonly duration: number;
}

export async function launch(options: Options) {

	try {
		fs.rmSync(DATA_FOLDER, { recursive: true });
	} catch (error) { }
	fs.mkdirSync(DATA_FOLDER, { recursive: true });

	if (options.runtimeTraceCategories || options.profAppendHeapStatistics) {
		try {
			fs.mkdirSync(RUNTIME_TRACE_FOLDER);
		} catch (error) { }
	}

	const runs = options.runs ?? PERFORMANCE_RUNS;
	const durations = new Map<string, number[]>();
	const perfFile = (options.runtime === Runtime.Web ? options.profAppendTimers ?? options.durationMarkersFile : options.durationMarkersFile) ?? PERFORMANCE_FILE;
	const markers = options.durationMarkers?.length ? [...options.durationMarkers] : ['ellapsed'];
	const playwrightStorageState = options.runtime === Runtime.Web ? await preparePlaywright(options) : undefined;

	for (let i = 0; i < runs; i++) {
		console.log(`${chalk.gray('[perf]')} running session ${chalk.green(`${i + 1}`)} of ${chalk.green(`${runs}`)}...`);

		let timedOut = false;
		let promise: Promise<string | undefined>;
		const abortController = new AbortController();
		const abortListener = () => {
			abortController.abort();
			process.removeListener('SIGINT', abortListener);
		}
		process.on('SIGINT', abortListener);

		switch (options.runtime) {
			case Runtime.Desktop:
				promise = launchDesktop(options, perfFile, markers, abortController.signal);
				break;
			case Runtime.Web:
				promise = launchWeb(options, perfFile, markers[0], playwrightStorageState, abortController.signal);
				break;
		}

		let handle;
		const content = await Promise.race([
			new Promise<void>(resolve => {
				handle = setTimeout(() => {
					timedOut = true;
					resolve();
				}, PERFORMANCE_RUN_TIMEOUT)
			}),
			promise
		]);

		if (timedOut) {
			console.log(`${chalk.red('[perf]')} timeout after ${chalk.green(`${PERFORMANCE_RUN_TIMEOUT}ms`)}`);
			abortController.abort();
		} else {
			clearTimeout(handle);
			if (abortController.signal.aborted) {
				process.exit(); // Exit if there is an interruption
			}
			if (content) {
				for (const marker of markers) {
					logMarker(content, marker, durations);
				}
			} else {
				console.log(`${chalk.red('[perf]')} no perf data found.`);
			}
		}

	}

	console.log(`${chalk.gray('[perf]')} ${chalk.blueBright('Summary')}:`);
	for (const marker of markers) {
		const markerDurations = durations.get(marker) ?? [];
		console.log(`${chalk.gray('[perf]')} ${marker}: ${chalk.green(`${markerDurations[0]}ms`)} (fastest), ${chalk.green(`${markerDurations[markerDurations.length - 1]}ms`)} (slowest), ${chalk.green(`${markerDurations[Math.floor(markerDurations.length / 2)]}ms`)} (median)`);
	}
}

async function launchDesktop(options: Options, perfFile: string, markers: string[], signal: AbortSignal): Promise<string | undefined> {

	const codeArgs = [
		'--accept-server-license-terms',
		'--skip-welcome',
		'--skip-release-notes',
		'--disable-updates',
		'--disable-experiments',
		'--force-user-env', // emulate a startup from UI that triggers shell resolution
		'--user-data-dir',
		USER_DATA_FOLDER,
		'--extensions-dir',
		EXTENSIONS_FOLDER,
		'--disable-extensions',
		'--disable-workspace-trust',
		'--disable-features=CalculateNativeWinOcclusion', // disable penalty for occluded windows
		'--prof-duration-markers-file',
		perfFile
	];

	if (process.platform === 'win32' || process.platform === 'linux') {
		// disable GPU to reduce the chance of flaky
		// runs: we have seen the GPU process crash multiple
		// times on Windows on startup, and on linux we run
		// most of the times in a VM with no proper gpu support.
		codeArgs.push('--disable-gpu');
	}

	if (options.profAppendTimers) {
		codeArgs.push('--prof-append-timers');
		codeArgs.push(options.profAppendTimers);
	}

	for (const marker of markers) {
		codeArgs.push('--prof-duration-markers');
		codeArgs.push(marker);
	}

	if (options.folderToOpen) {
		codeArgs.push(options.folderToOpen);
	}

	if (options.fileToOpen) {
		codeArgs.push(options.fileToOpen);
	}

	if (options.profAppendHeapStatistics || options.runtimeTraceCategories) {
		const traceFilePath = join(RUNTIME_TRACE_FOLDER, `chrometrace_${new Date().getTime()}.log`);
		console.log(`${chalk.gray('[perf]')} saving chromium trace file at ${chalk.green(`${traceFilePath}`)}`);
		codeArgs.push(`--trace-startup-file=${traceFilePath}`);

		if (options.profAppendHeapStatistics) {
			codeArgs.push(`--enable-tracing=v8`);
			codeArgs.push(`--trace-startup-format=json`);
			codeArgs.push(`--trace-startup-duration=5`);
		} else if (options.runtimeTraceCategories) {
			codeArgs.push(`--enable-tracing=${options.runtimeTraceCategories}`);
		}
	}

	if (options.disableCachedData) {
		codeArgs.push('--no-cached-data');
	}

	if (options.disableTelemetry) {
		codeArgs.push('--disable-telemetry');
	}

	let childProcess: cp.ChildProcessWithoutNullStreams | undefined;
	signal.addEventListener('abort', () => childProcess?.kill());
	childProcess = cp.spawn(options.build, codeArgs); // CodeQL [SM01509] Either the user has to explicitly pass in options.build or a valid VS Code build is spawned.
	childProcess.stdout.on('data', data => {
		if (options.verbose) {
			console.log(`${chalk.gray('[electron]')}: ${data.toString()}`);
		}
	});
	childProcess.stderr.on('data', data => {
		if (options.verbose) {
			console.log(`${chalk.red('[electron]')}: ${data.toString()}`);
		}
	});

	await (new Promise<void>(resolve => childProcess?.on('exit', () => resolve())));
	childProcess = undefined;

	if (fs.existsSync(perfFile)) {
		return readLastLineSync(perfFile);
	}

	if (options.profAppendTimers) {
		const content = readLastLineSync(options.profAppendTimers);
		return `ellapsed	${content}`;
	}

	return undefined;
}

async function preparePlaywright(options: Options): Promise<IPlaywrightStorageState | undefined> {
	const url = new URL(options.build);
	if (options.token && (url.hostname === VSCODE_DEV_HOST_NAME || url.hostname === INSIDERS_VSCODE_DEV_HOST_NAME)) {
		return generateVscodeDevAuthState(options.token);
	}
	return undefined;
}

async function launchWeb(options: Options, perfFile: string, durationMarker: string, playwrightStorageState: IPlaywrightStorageState | undefined, signal: AbortSignal): Promise<string> {
	const url = new URL(options.build);

	if (options.folderToOpen) {
		url.searchParams.set('folder', options.folderToOpen);
	}

	const payload: string[][] = [];

	// profDurationMarkers
	payload.push(['profDurationMarkers', durationMarker === 'ellapsed' ? 'code/timeOrigin,code/didStartWorkbench' : durationMarker.split('-').join(',')]);

	if (options.fileToOpen) {
		payload.push(['openFile', options.fileToOpen]);
	}

	// disable annoyers
	payload.push(['skipWelcome', 'true']);
	payload.push(['skipReleaseNotes', 'true']);

	url.searchParams.set('payload', JSON.stringify(payload));

	// Use playwright to open the page
	// and watch out for the desired performance measurement to
	// be printed to the console.

	const browser = await playwright.chromium.launch({ headless: false });

	signal.addEventListener('abort', () => browser.close());

	if (signal.aborted) {
		browser.close();
	}

	const page = await browser.newPage({
		storageState: playwrightStorageState,
		viewport: { width: 1200, height: 800 }
	});

	const cdp = await page.context().newCDPSession(page);
	const heapTracing = await startHeapTracing(cdp);

	if (options.verbose) {
		page.on('pageerror', error => console.error(`Playwright ERROR: page error: ${error}`));
		page.on('crash', () => console.error('Playwright ERROR: page crash'));
		page.on('requestfailed', e => console.error('Playwright ERROR: Request Failed', e.url(), e.failure()?.errorText));
		page.on('response', response => {
			if (response.status() >= 400) {
				console.error(`Playwright ERROR: HTTP status ${response.status()} for ${response.url()}`);
			}
		});
	}

	return new Promise<string>(async resolve => {
		page.on('console', async msg => {
			const text = msg.text();
			if (options.verbose) {
				console.error(`Playwright Console: ${text}`);
			}

			// Write full message to perf file if we got a path
			const matches = /\[prof-timers\] (.+)/.exec(text);
			if (matches?.[1]) {
				await new Promise(resolve => setTimeout(resolve, 3000)); // give some time for page to settle
				const data = await heapTracing.stop();

				browser.close();

				fs.appendFileSync(perfFile, `${matches[1]}\t${gcStatisticsToString(data)}\n`);
				resolve(`${durationMarker}	${matches[1]}`);
			}
		});
		page.goto(url.href);
	});
}

async function startHeapTracing(cdp: playwright.CDPSession): Promise<{ stop: () => Promise<IGCStatistics> }> {
	await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['v8'] } });

	const data: ITracingData[] = [];
	cdp.on('Tracing.dataCollected', e => {
		data.push(...e.value as unknown as ITracingData[]);
	});

	return {
		stop: () => resolveStartupHeapStatistics(cdp, data)
	}
}

async function resolveStartupHeapStatistics(cdp: playwright.CDPSession, data: ITracingData[]): Promise<IGCStatistics> {

	// Wait for tracing to complete
	const tracingComplete = new Promise<unknown>(resolve => cdp.once('Tracing.tracingComplete', resolve));
	await cdp.send('Tracing.end');
	await tracingComplete;

	// Compute GC statistics
	let minorGCs = 0;
	let majorGCs = 0;
	let garbage = 0;
	let duration = 0;

	for (const event of data) {
		switch (event.name) {

			// Major/Minor GC Events
			case 'MinorGC':
				minorGCs++;
			case 'MajorGC':
				majorGCs++;
				if (event.args && typeof event.args.usedHeapSizeAfter === 'number' && typeof event.args.usedHeapSizeBefore === 'number') {
					garbage += (event.args.usedHeapSizeBefore - event.args.usedHeapSizeAfter);
				}
				break;

			// GC Events that block the main thread
			// Refs: https://v8.dev/blog/trash-talk
			case 'V8.GCFinalizeMC':
			case 'V8.GCScavenger':
				duration += event.dur;
				break;
		}
	}

	// Collect final heap snapshot
	const heapSnapshot = await collectHeapSnaptshot(cdp);
	garbage += heapSnapshot.garbage;

	return { minorGCs, majorGCs, used: heapSnapshot.used, garbage, duration: Math.round(duration / 1000) };
}

function gcStatisticsToString({ used, garbage, majorGCs, minorGCs, duration }: IGCStatistics) {
	return `Heap: ${Math.round(used / MB)}MB (used) ${Math.round(garbage / MB)}MB (garbage) ${majorGCs} (MajorGC) ${minorGCs} (MinorGC) ${duration}ms (GC duration)`;
}

async function collectHeapSnaptshot(cdp: playwright.CDPSession) {
	const usedSizeBeforeGC = (await cdp.send("Runtime.getHeapUsage")).usedSize;
	await cdp.send("HeapProfiler.collectGarbage");
	const usedSizeAfterGC = (await cdp.send("Runtime.getHeapUsage")).usedSize;

	return { used: usedSizeAfterGC, garbage: usedSizeBeforeGC - usedSizeAfterGC };
}

function logMarker(content: string, marker: string, durations: Map<string, number[]>): void {
	const regex = new RegExp(`${escapeRegExpCharacters(marker)}\\s+(\\d+)`);
	const matches = regex.exec(content);

	if (!matches?.length) {
		return;
	}

	const duration = parseInt(matches[1]);
	const markerDurations = durations.get(marker) ?? [];
	markerDurations.push(duration);
	markerDurations.sort((/** @type {number} */ a, /** @type {number} */ b) => a - b);
	durations.set(marker, markerDurations);

	const middleIndex = Math.floor(markerDurations.length / 2);
	const median = markerDurations.length % 2 === 0 ? (markerDurations[middleIndex - 1] + markerDurations[middleIndex]) / 2 : markerDurations[middleIndex];

	console.log(`${chalk.gray('[perf]')} ${marker}: ${chalk.green(`${duration}ms`)} (current), ${chalk.green(`${markerDurations[0]}ms`)} (fastest), ${chalk.green(`${markerDurations[markerDurations.length - 1]}ms`)} (slowest), ${chalk.green(`${median}ms`)} (median)`);
}

function readLastLineSync(path: string): string {
	const contents = fs.readFileSync(path, 'utf8');
	const lines = contents.split(/\r?\n/);

	let lastLine: string | undefined;
	while (!lastLine && lines.length > 0) {
		lastLine = lines.pop();
	}

	return lastLine ?? '';
}

function escapeRegExpCharacters(value: string): string {
	return value.replace(/[\\\{\}\*\+\?\|\^\$\.\[\]\(\)]/g, '\\$&');
}