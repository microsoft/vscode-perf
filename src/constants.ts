/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from 'os';
import { join } from 'path';

export const ROOT = join(tmpdir(), 'vscode-perf');

export const USER_DATA_FOLDER = join(ROOT, 'user-data-dir');
export const EXTENSIONS_FOLDER = join(ROOT, 'extensions-dir');
export const PERFORMANCE_FILE = join(ROOT, 'startup-perf.txt');
export const PERFORMANCE_RUNS = 10;

export enum Platform {
    MacOSX64 = 1,
    MacOSArm,
    LinuxX64,
    LinuxArm,
    WindowsX64,
    WindowsArm
}

export const platform = (() => {
    if (process.platform === 'win32') {
        return process.arch === 'arm64' ? Platform.WindowsArm : Platform.WindowsX64;
    }

    if (process.platform === 'darwin') {
        return process.arch === 'arm64' ? Platform.MacOSArm : Platform.MacOSX64;
    }

    if (process.platform === 'linux') {
        return process.arch === 'arm64' ? Platform.LinuxArm : Platform.LinuxX64;
    }

    throw new Error('Unsupported platform.');
})();