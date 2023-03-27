/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from 'os';
import { join } from 'path';

export const ROOT = join(tmpdir(), 'vscode-perf');

export const BUILDS_FOLDER = join(ROOT, '.builds');

export const DATA_FOLDER = join(ROOT, '.data');
export const USER_DATA_FOLDER = join(DATA_FOLDER, 'data');
export const EXTENSIONS_FOLDER = join(DATA_FOLDER, 'extensions');
export const PERFORMANCE_FILE = join(ROOT, 'startup-perf.txt');
export const RUNTIME_TRACE_FOLDER = join(ROOT, 'vscode-runtime-traces');

export const PERFORMANCE_RUNS = 10;
export const VSCODE_DEV_HOST_NAME = 'vscode.dev';
export const INSIDERS_VSCODE_DEV_HOST_NAME = 'insiders.vscode.dev';

export enum Platform {
    MacOSX64 = 1,
    MacOSArm,
    LinuxX64,
    LinuxArm,
    WindowsX64,
    WindowsArm
}

export enum Runtime {
    Web = 1,
    Desktop
}

export enum Quality {
    Exploration = 'exploration',
    Insider = 'insider',
    Stable = 'stable',
}

export type Commit = string | 'latest';

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