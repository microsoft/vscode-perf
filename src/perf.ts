/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EXTENSIONS_FOLDER, PERFORMANCE_FILE, PERFORMANCE_RUNS, ROOT, USER_DATA_FOLDER } from "./constants";
import * as fs from 'fs';
import * as cp from 'child_process';
import chalk from "chalk";

export interface Options {
	build: string;
	durationMarkers?: string[];
	durationMarkersFile?: string;
	runs?: number;
	folderToOpen?: string;
	fileToOpen?: string;
	profAppendTimers?: string;
	verbose?: boolean;
}

export async function launch(options: Options) {

	try {
		fs.rmSync(ROOT, { recursive: true });
	} catch (error) { }
	fs.mkdirSync(ROOT, { recursive: true });

	const perfFile = options.durationMarkersFile ?? PERFORMANCE_FILE;

	const codeArgs = [
		'--accept-server-license-terms',
		'--skip-welcome',
		'--skip-release-notes',
		'--disable-updates',
		'--user-data-dir',
		USER_DATA_FOLDER,
		'--extensions-dir',
		EXTENSIONS_FOLDER,
		'--disable-extensions',
		'--disable-workspace-trust',
		'--disable-features=CalculateNativeWinOcclusion',
		'--wait',
		'--prof-duration-markers-file',
		perfFile,
	];

	if (options.profAppendTimers) {
		codeArgs.push('--prof-append-timers');
		codeArgs.push(options.profAppendTimers);
	}

	const markers: string[] = options.durationMarkers?.length ? [...options.durationMarkers] : ['ellapsed'];
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

	const runs = options.runs ?? PERFORMANCE_RUNS;
	const durations = new Map<string, number[]>();

	let childProcess: cp.ChildProcessWithoutNullStreams | undefined;
	process.on('exit', () => {
		if (childProcess) {
			childProcess.kill();
		}
	});

	for (let i = 0; i < runs; i++) {

		console.log(`${chalk.gray('[perf]')} running session ${chalk.green(`${i + 1}`)} of ${chalk.green(`${runs}`)}...`);

		childProcess = cp.spawn(options.build, codeArgs);
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
			const content = readLastLineSync(perfFile);
			for (const marker of markers) {
				logMarker(content, marker, durations);
			}
		} else if (options.profAppendTimers) {
			const content = readLastLineSync(options.profAppendTimers);
			const marker = 'ellapsed';
			logMarker(`${marker}	${content}`, marker, durations);
		} else {
			console.error('No perf file found');
			process.exit(1);
		}
	}

	console.log(`${chalk.gray('[perf]')} ${chalk.blueBright('Summary')}:`);
	for (const marker of markers) {
		const markerDurations = durations.get(marker) ?? [];
		console.log(`${chalk.gray('[perf]')} ${marker}: ${chalk.green(`${markerDurations[0]}ms`)} (fastest), ${chalk.green(`${markerDurations[markerDurations.length - 1]}ms`)} (slowest), ${chalk.green(`${markerDurations[Math.floor(markerDurations.length / 2)]}ms`)} (median)`);
	}
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

	console.log(`${chalk.gray('[perf]')} ${marker}: ${chalk.green(`${duration}ms`)} (current), ${chalk.green(`${markerDurations[0]}ms`)} (fastest), ${chalk.green(`${markerDurations[markerDurations.length - 1]}ms`)} (slowest), ${chalk.green(`${markerDurations[Math.floor(markerDurations.length / 2)]}ms`)} (median)`);
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