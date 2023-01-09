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
	'duration-markers'?: string[];
	file?: string;
	runs?: number;
	folderToOpen?: string;
	fileToOpen?: string;
}

export async function launch(options: Options) {

	try {
		fs.rmSync(ROOT, { recursive: true });
	} catch (error) { }
	fs.mkdirSync(ROOT, { recursive: true });

	const perfFile = options.file || PERFORMANCE_FILE;

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

	if (options.folderToOpen) {
		codeArgs.push(options.folderToOpen);
	}

	if (options.fileToOpen) {
		codeArgs.push(options.fileToOpen);
	}

	const markers = options['duration-markers'] ? Array.isArray(options['duration-markers']) ? options['duration-markers'] : [options['duration-markers']] : [];
	markers.splice(0, 0, 'ellapsed');
	for (const marker of markers) {
		codeArgs.push('--prof-duration-markers');
		codeArgs.push(marker);
	}

	const runs = options.runs ?? PERFORMANCE_RUNS;
	const durations = new Map<string, number[]>();

	for (let i = 0; i < runs; i++) {

		console.log(`${chalk.gray('[perf]')} running session ${chalk.green(`${i + 1}`)} of ${chalk.green(`${runs}`)}...`);

		const childProcess = cp.spawn(options.build, codeArgs);
		await (new Promise<void>(resolve => childProcess.on('exit', () => resolve())));

		const lines = fs.readFileSync(perfFile, 'utf8').split('\n');
		let content = '';
		for (let j = lines.length - 1; j >= 0 && !content; j--) {
			content = lines[j];
		}
		for (const marker of markers) {
			logMarker(content, marker, durations);
		}
	}

	console.log(`${chalk.gray('[perf]')} ${chalk.blueBright('Summary')}:`);
	for (const marker of markers) {
		const markerDurations = durations.get(marker) ?? [];
		console.log(`${chalk.gray('[perf]')} ${marker}: ${chalk.green(`${markerDurations[0]}ms`)} (fastest), ${chalk.green(`${markerDurations[markerDurations.length - 1]}ms`)} (slowest), ${chalk.green(`${markerDurations[Math.floor(markerDurations.length / 2)]}ms`)} (median)`);
	}

}

function logMarker(content: string, marker: string, durations: Map<string, number[]>): void {

	const index = content.indexOf(marker);
	if (index === -1) {
		return;
	}
	const matches = /(\d+)/.exec(content.substring(index));

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