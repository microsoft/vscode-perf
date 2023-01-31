/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import chalk from 'chalk';
import { Option, OptionValues, program } from 'commander';
import { mkdirSync, rmSync } from 'fs';
import { installBuild } from './builds';
import { Quality, ROOT, Runtime } from './constants';
import { launch } from './perf';

interface Options extends OptionValues {
	build: string | Quality;
	unreleased?: boolean;
	durationMarkers?: string | string[];
	durationMarkersFile?: string;
	runs?: string;
	folder?: string;
	file?: string;
	verbose?: boolean;
	profAppendTimers?: string;
	runtime?: string;
	token?: string;
}

export async function run(options?: Options): Promise<void> {

	if (!options) {
		program
			.requiredOption('-b, --build <build>', 'quality or the location of the build to measure the performance of. Location can be a path to a build or a URL to a build. Quality options: `stable`, `insider`, `exploration`.')
			.option('--unreleased', 'Include unreleased builds in the search for the build to measure the performance of.')
			.option('-m, --duration-markers <duration-markers>', 'pair of markers separated by `-` between which the duration has to be measured. Eg: `code/didLoadWorkbenchMain-code/didLoadExtensions')
			.option('--duration-markers-file <duration-markers-file>', 'file in which the performance measurements shall be recorded')
			.option('--folder <folder>', 'folder to open in VSCode while measuring the performance')
			.option('--file <file>', 'file to open in VSCode while measuring the performance')
			.option('--runs <number-of-runs>', 'number of times to run the performance measurement')
			.option('-v, --verbose', 'logs verbose output to the console when errors occur')
			.option('-t, --token <token>', `a GitHub token of scopes 'repo', 'workflow', 'user:email', 'read:user' to enable additional performance tests targetting web`)
			.addOption(new Option('-r, --runtime <runtime>', 'whether to measure the performance of desktop or web runtime').choices(['desktop', 'web']))
			.addOption(new Option('--prof-append-timers <prof-append-timers>').hideHelp(true));

		options = program.parse(process.argv).opts<Options>();
	}

	try {
		try { rmSync(ROOT, { recursive: true }); } catch (error) { }
		mkdirSync(ROOT, { recursive: true });

		const runtime = options.runtime === 'web' ? Runtime.Web : Runtime.Desktop;
		let build: string | Quality = options.build;
		switch (build) {
			case 'stable':
			case 'insider':
			case 'exploration':
				build = await installBuild(runtime, build as Quality, options.unreleased);
				break;
		}
		await launch({
			build,
			runtime,
			durationMarkers: options.durationMarkers ? Array.isArray(options.durationMarkers) ? options.durationMarkers : [options.durationMarkers] : undefined,
			durationMarkersFile: options.durationMarkersFile,
			runs: options.runs ? parseInt(options.runs) : undefined,
			folderToOpen: options.folder,
			fileToOpen: options.file,
			profAppendTimers: options.profAppendTimers,
			token: options.token,
		});
	} catch (error) {
		console.log(`${chalk.red('[error]')} ${error}`);
		process.exit(1);
	}
}