/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { dirname, join } from 'path';
import { BUILDS_FOLDER, Platform, platform, Quality, Runtime } from './constants';
import { get } from 'https';
import chalk from "chalk";
import { createWriteStream, existsSync, promises } from 'fs';
import { spawnSync } from 'child_process';
import fetch, { Headers } from 'node-fetch';

interface IBuildMetadata {
	url: string;
	productVersion: string;
	version: string;
}

export async function installBuild(runtime: Runtime, quality: Quality, unreleased?: boolean): Promise<string> {

	const buildMetadata = await fetchBuildMetadata(runtime, quality, unreleased);
	const buildName = getBuildArchiveName(runtime, buildMetadata);
	const path = join(getBuildPath(buildMetadata.version), buildName);
	let destination: string;

	if (runtime === Runtime.Desktop && platform === Platform.WindowsX64 || platform === Platform.WindowsArm) {
		// zip does not contain a single top level folder to use...
		destination = path.substring(0, path.lastIndexOf('.zip'));
	} else {
		// zip contains a single top level folder to use
		destination = dirname(path);
	}

	if (!existsSync(path)) {
		// Download
		const url = `https://az764295.vo.msecnd.net/${quality}/${buildMetadata.version}/${buildName}`;
		console.log(`${chalk.gray('[build]')} downloading build from ${chalk.green(url)}...`);
		await fileGet(url, path);

		// Unzip
		console.log(`${chalk.gray('[build]')} unzipping build to ${chalk.green(destination)}...`);
		await unzip(path, destination);
	}

	return getBuildExecutable(runtime, quality, buildMetadata);
}

function getBuildExecutable(runtime: Runtime, quality: Quality, buildMetadata: IBuildMetadata): string {
	const buildPath = getBuildPath(buildMetadata.version);
	const buildName = getBuildName(runtime, quality, buildMetadata);

	switch (runtime) {
		case Runtime.Web:
			switch (platform) {
				case Platform.MacOSX64:
				case Platform.MacOSArm:
				case Platform.LinuxX64:
				case Platform.LinuxArm: {
					const oldLocation = join(buildPath, buildName, 'server.sh');
					if (existsSync(oldLocation)) {
						return oldLocation; // only valid until 1.64.x
					}

					return join(buildPath, buildName, 'bin', quality === Quality.Insider ? 'code-server-insiders' : quality === Quality.Exploration ? `code-server-exploration` : `code-server`);
				}
				case Platform.WindowsX64:
				case Platform.WindowsArm: {
					const oldLocation = join(buildPath, buildName, 'server.cmd');
					if (existsSync(oldLocation)) {
						return oldLocation; // only valid until 1.64.x
					}

					return join(buildPath, buildName, 'bin', quality === Quality.Insider ? 'code-server-insiders.cmd' : quality === Quality.Exploration ? `code-server-exploration.cmd` : `code-server.cmd`);
				}
			}

		case Runtime.Desktop:
			switch (platform) {
				case Platform.MacOSX64:
				case Platform.MacOSArm:
					return join(buildPath, buildName, 'Contents', 'MacOS', 'Electron')
				case Platform.LinuxX64:
				case Platform.LinuxArm:
					return join(buildPath, buildName, quality === Quality.Insider ? 'code-insiders' : quality === Quality.Exploration ? `code-exploration` : `code`)
				case Platform.WindowsX64:
				case Platform.WindowsArm:
					return join(buildPath, buildName, quality === Quality.Insider ? 'Code - Insiders.exe' : quality === Quality.Exploration ? `Code - Exploration.exe` : `Code.exe`)
			}
	}
}

function getBuildPath(commit: string): string {
	if (platform === Platform.WindowsX64 || platform === Platform.WindowsArm) {
		return join(BUILDS_FOLDER, commit.substring(0, 6)); // keep the folder path small for windows max path length restrictions
	}
	return join(BUILDS_FOLDER, commit);
}

function getBuildArchiveName(runtime: Runtime, buildMetadata: IBuildMetadata): string {
	switch (runtime) {

		// We currently do not have ARM enabled servers
		// so we fallback to x64 until we ship ARM.
		case Runtime.Web:
			switch (platform) {
				case Platform.MacOSX64:
				case Platform.MacOSArm:
					return 'vscode-server-darwin-x64-web.zip';
				case Platform.LinuxX64:
				case Platform.LinuxArm:
					return 'vscode-server-linux-x64-web.tar.gz';
				case Platform.WindowsX64:
				case Platform.WindowsArm:
					return 'vscode-server-win32-x64-web.zip';
			}

		// Every platform has its own name scheme, hilarious right?
		// - macOS: just the name, nice! (e.g. VSCode-darwin.zip)
		// - Linux: includes some unix timestamp (e.g. code-insider-x64-1639979337.tar.gz)
		// - Windows: includes the version (e.g. VSCode-win32-x64-1.64.0-insider.zip)
		case Runtime.Desktop:
			switch (platform) {
				case Platform.MacOSX64:
					return 'VSCode-darwin.zip';
				case Platform.MacOSArm:
					return 'VSCode-darwin-arm64.zip';
				case Platform.LinuxX64:
				case Platform.LinuxArm:
					return buildMetadata.url.split('/').pop()!; // e.g. https://az764295.vo.msecnd.net/insider/807bf598bea406dcb272a9fced54697986e87768/code-insider-x64-1639979337.tar.gz
				case Platform.WindowsX64:
				case Platform.WindowsArm: {
					return platform === Platform.WindowsX64 ? `VSCode-win32-x64-${buildMetadata.productVersion}.zip` : `VSCode-win32-arm64-${buildMetadata.productVersion}.zip`;
				}
			}
	}
}

function getBuildName(runtime: Runtime, quality: Quality, buildMetadata: IBuildMetadata): string {
	switch (runtime) {
		case Runtime.Web:
			switch (platform) {
				case Platform.MacOSX64:
				case Platform.MacOSArm:
					return 'vscode-server-darwin-x64-web';
				case Platform.LinuxX64:
				case Platform.LinuxArm:
					return 'vscode-server-linux-x64-web';
				case Platform.WindowsX64:
				case Platform.WindowsArm:
					return 'vscode-server-win32-x64-web';
			}

		// Here, only Windows does not play by our rules and adds the version number
		// - Windows: includes the version (e.g. VSCode-win32-x64-1.64.0-insider)
		case Runtime.Desktop:
			switch (platform) {
				case Platform.MacOSX64:
				case Platform.MacOSArm:
					return quality === Quality.Insider ? 'Visual Studio Code - Insiders.app' : quality === Quality.Exploration ? `Visual Studio Code - Exploration.app` : `Visual Studio Code.app`;
				case Platform.LinuxX64:
					return 'VSCode-linux-x64';
				case Platform.LinuxArm:
					return 'VSCode-linux-arm64';
				case Platform.WindowsX64:
				case Platform.WindowsArm: {
					return platform === Platform.WindowsX64 ? `VSCode-win32-x64-${buildMetadata.productVersion}` : `VSCode-win32-arm64-${buildMetadata.productVersion}`;
				}
			}
	}
}

function getBuildApiName(runtime: Runtime): string {
	switch (runtime) {
		case Runtime.Web:
			switch (platform) {
				case Platform.MacOSX64:
				case Platform.MacOSArm:
					return 'server-darwin-web';
				case Platform.LinuxX64:
				case Platform.LinuxArm:
					return 'server-linux-x64-web';
				case Platform.WindowsX64:
				case Platform.WindowsArm:
					return 'server-win32-x64-web';
			}

		case Runtime.Desktop:
			switch (platform) {
				case Platform.MacOSX64:
					return 'darwin';
				case Platform.MacOSArm:
					return 'darwin-arm64';
				case Platform.LinuxX64:
					return 'linux-x64';
				case Platform.LinuxArm:
					return 'linux-arm64';
				case Platform.WindowsX64:
					return 'win32-x64';
				case Platform.WindowsArm:
					return 'win32-arm64';
			}
	}
}

async function fetchBuildMetadata(runtime: Runtime, quality: Quality, unreleased?: boolean): Promise<IBuildMetadata> {
	const buildApiName = getBuildApiName(runtime);
	const headers = unreleased ? new Headers({ 'x-vscode-released': 'false' }) : undefined;
	const { version } = await jsonGet<{ version: string }>(`https://update.code.visualstudio.com/api/latest/${buildApiName}/${quality}`, headers)
	return jsonGet<IBuildMetadata>(`https://update.code.visualstudio.com/api/versions/commit:${version}/${buildApiName}/${quality}`, headers);
}

async function jsonGet<T>(url: string, headers?: Headers): Promise<T> {
	const authResponse = await fetch(url, { method: 'GET', headers });
	if (!authResponse.ok) {
		throw new Error(`Failed to get response from update server: ${authResponse.status} ${authResponse.statusText}`);
	}
	return await authResponse.json();
}

async function fileGet(url: string, path: string): Promise<void> {

	// Ensure parent folder exists
	await promises.mkdir(dirname(path), { recursive: true });

	// Download
	return new Promise((resolve, reject) => {
		const request = get(url, res => {
			const outStream = createWriteStream(path);
			outStream.on('close', () => resolve());
			outStream.on('error', reject);

			res.on('error', reject);
			res.pipe(outStream);
		});

		request.on('error', reject);
	});
}

async function unzip(source: string, destination: string): Promise<void> {

	// *.zip: macOS, Windows
	if (source.endsWith('.zip')) {

		// Windows
		if (platform === Platform.WindowsX64 || platform === Platform.WindowsArm) {
			spawnSync('powershell.exe', [
				'-NoProfile',
				'-ExecutionPolicy', 'Bypass',
				'-NonInteractive',
				'-NoLogo',
				'-Command',
				`Microsoft.PowerShell.Archive\\Expand-Archive -Path "${source}" -DestinationPath "${destination}"`
			]);
		}

		// macOS
		else {
			spawnSync('unzip', [source, '-d', destination]);
		}
	}

	// *.tar.gz: Linux
	else {
		if (!existsSync(destination)) {
			await promises.mkdir(destination); // tar does not create extractDir by default
		}

		spawnSync('tar', ['-xzf', source, '-C', destination]);
	}
}