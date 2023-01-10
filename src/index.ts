/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import chalk from 'chalk';
import { Option, program } from 'commander';
import { launch } from './perf';

module.exports = async function (argv: string[]): Promise<void> {

	interface Opts {
		build: string;
		durationMarkers?: string | string[];
		durationMarkersFile: string;
		runs?: string;
		folder?: string;
		file?: string;
		profAppendTimers?: string;
	}

	program
		.requiredOption('-b, --build <build>', 'executable location of the build to measure the performance of')
		.option('-m, --duration-markers <duration-markers>', 'pair of markers separated by `-` between which the duration has to be measured. Eg: `code/didLoadWorkbenchMain-code/didLoadExtensions')
		.option('--duration-markers-file <duration-markers-file>', 'file in which the performance measurements shall be recorded')
		.option('--folder <folder>', 'folder to open in VSCode while measuring the performance')
		.option('--file <file>', 'file to open in VSCode while measuring the performance')
		.option('--runs <number-of-runs>', 'number of times to run the performance measurement')
		.addOption(new Option('--prof-append-timers <prof-append-timers>').hideHelp(true));

	const opts: Opts = program.parse(argv).opts();

	try {
		await launch({
			build: opts.build,
			durationMarkers: opts.durationMarkers ? Array.isArray(opts.durationMarkers) ? opts.durationMarkers : [opts.durationMarkers] : undefined,
			durationMarkersFile: opts.durationMarkersFile,
			runs: opts.runs ? parseInt(opts.runs) : undefined,
			folderToOpen: opts.folder,
			fileToOpen: opts.file,
			profAppendTimers: opts.profAppendTimers
		});
	} catch (error) {
		console.log(`${chalk.red('[error]')} ${error}`);
		process.exit(1);
	}
}