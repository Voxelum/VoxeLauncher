/* eslint-disable */

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as iconv from 'iconv-lite';

export const UTF8 = 'utf8';
export const UTF8_with_bom = 'utf8bom';
export const UTF16be = 'utf16be';
export const UTF16le = 'utf16le';

export type UTF_ENCODING = typeof UTF8 | typeof UTF8_with_bom | typeof UTF16be | typeof UTF16le;

export function isUTFEncoding(encoding: string): encoding is UTF_ENCODING {
    return [UTF8, UTF8_with_bom, UTF16be, UTF16le].some(utfEncoding => utfEncoding === encoding);
}

export const UTF16be_BOM = [0xFE, 0xFF];
export const UTF16le_BOM = [0xFF, 0xFE];
export const UTF8_BOM = [0xEF, 0xBB, 0xBF];

const AUTO_ENCODING_GUESS_MAX_BYTES = 512 * 128; 	// set an upper limit for the number of bytes we pass on to jschardet

export function decode(buffer: Buffer, encoding: string): string {
    return iconv.decode(buffer, toNodeEncoding(encoding));
}

export function encodingExists(encoding: string): boolean {
    return iconv.encodingExists(toNodeEncoding(encoding));
}

function toNodeEncoding(enc: string | null): string {
    if (enc === UTF8_with_bom || enc === null) {
        return UTF8; // iconv does not distinguish UTF 8 with or without BOM, so we need to help it
    }

    return enc;
}

/**
 * Guesses the encoding from buffer.
 */
export async function guessEncodingByBuffer(buffer: Buffer): Promise<string | null> {
    const jschardet = await import('jschardet');

    const guessed = jschardet.detect(buffer.slice(0, AUTO_ENCODING_GUESS_MAX_BYTES)); // ensure to limit buffer for guessing due to https://github.com/aadsm/jschardet/issues/53
    if (!guessed || !guessed.encoding) {
        return null;
    }

    return toIconvLiteEncoding(guessed.encoding);
}

const JSCHARDET_TO_ICONV_ENCODINGS: { [name: string]: string } = {
    'ibm866': 'cp866',
    'big5': 'cp950'
};

function toIconvLiteEncoding(encodingName: string): string {
    const normalizedEncodingName = encodingName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const mapped = JSCHARDET_TO_ICONV_ENCODINGS[normalizedEncodingName];

    return mapped || normalizedEncodingName;
}
