/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fetch from 'node-fetch';
import * as cookie from 'cookie';
import Base64 from 'js-base64';
import { webcrypto } from 'crypto';
import { IPlaywrightStorageState } from './types';

function* flatten(...iterables: Uint8Array[]) {
    for (const iterable of iterables) {
        for (const el of iterable) {
            yield el;
        }
    }
}

async function encrypt(serverKey: Uint8Array, data: string): Promise<string> {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const clientKeyObj = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const clientKey = new Uint8Array(await webcrypto.subtle.exportKey('raw', clientKeyObj));
    const keyData = new Uint8Array(32);

    for (let i = 0; i < keyData.byteLength; i++) {
        keyData[i] = clientKey[i] ^ serverKey[i];
    }

    const key = await webcrypto.subtle.importKey('raw', keyData, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const dataBase64 = Base64.encode(data);
    const dataUint8Array = Base64.toUint8Array(dataBase64);
    const cipherText = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv, }, key, dataUint8Array);
    const result = new Uint8Array(flatten(clientKey, iv, new Uint8Array(cipherText)));

    return Base64.fromUint8Array(result);
}

/**
 * Generates a Playwright storage state file for the  given GitHub username and token.
 * 
 * Make sure the token has the ['repo', 'workflow', 'user:email', 'read:user'] scopes.
 */
export async function generateVscodeDevAuthState(token: string): Promise<IPlaywrightStorageState> {
    const authResponse = await fetch('https://auth.insiders.vscode.dev/', { method: 'POST' });

    if (!authResponse.ok) {
        throw new Error(`Failed to reach auth endpoint: ${authResponse.status} ${authResponse.statusText}`);
    }

    const setCookieHeaders = authResponse.headers.raw()['set-cookie'];
    const vscodeSessionHeader = setCookieHeaders.find(header => header.startsWith('vscode.session='));
    const vscodeSessionCookie = cookie.parse(vscodeSessionHeader!);
    const rawServerKey = await authResponse.text();
    const serverKey = Base64.toUint8Array(rawServerKey);

    if (serverKey.byteLength != 32) {
        throw Error('The key retrieved by the server is not 32 bytes long.');
    }

    const credentials = [{
        account: 'github.auth',
        password: JSON.stringify({
            extensionId: 'vscode.github-authentication',
            content: JSON.stringify([{
                accessToken: token,
                account: { label: 'GitHub', id: 0 },
                id: 'github',
                scopes: ['repo', 'workflow', 'user:email', 'read:user']
            }])
        }),
        service: 'vscode-insidersvscode.github-authentication'
    }];

    return {
        cookies: [
            {
                name: "vscode.session",
                value: vscodeSessionCookie['vscode.session'],
                domain: "auth.insiders.vscode.dev",
                path: "/",
                expires: new Date(vscodeSessionCookie['expires']).getTime() / 1000,
                httpOnly: true,
                secure: false,
                sameSite: "Strict"
            }
        ],
        origins: [
            {
                origin: "https://insiders.vscode.dev",
                localStorage: [
                    {
                        name: "credentials.provider",
                        value: await encrypt(serverKey, JSON.stringify(credentials))
                    }
                ]
            }
        ]
    };
}