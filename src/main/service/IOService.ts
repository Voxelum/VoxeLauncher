import { MAX_RESOURCE_SIZE } from '@main/constant';
import { pipeline, sha1, sha1ByPath } from '@main/util/fs';
import { parseResourceByPath, RESOURCE_ENTRY_COMMON_MODPACK, RESOURCE_ENTRY_FABRIC, RESOURCE_ENTRY_FORGE, RESOURCE_ENTRY_LITELOADER, Resource, ENTRIES } from '@main/util/resource';
import { createHash } from 'crypto';
import { FileType, stream as fileTypeByStream } from 'file-type';
import { createReadStream, readFile, stat, mkdtemp, writeFile, rename } from 'fs-extra';
import { extname, basename, join } from 'path';
import ResourceService, { BuiltinType } from './ResourceService';
import Service, { Inject } from './Service';


export type ExpectFileType = string | '*' | 'mods' | 'forge' | 'fabric' | 'resourcepack' | 'liteloader' | 'curseforge-modpack' | 'save';

export interface FileParseOptions {
    path: string;
    hint?: ExpectFileType;
    size?: number;
}
export interface FilesParseOptions {
    files: FileParseOptions[];
}
export interface StagedFileResult {
    /**
     * Where the file import from
     */
    path: string;
    type: BuiltinType | 'modpack' | 'unknown';
    fileType: FileType | 'unknown' | 'directory';
    existed: boolean;
    /**
     * Suggested display name
     */
    displayName: string;
    /**
     * Metadata of the file
     */
    metadata: any;
    uri: string;
}


export interface FileCommitImportOptions {
    files: StagedFileResult[];
}


export default class IOService extends Service {
    @Inject('ResourceService')
    private resourceService!: ResourceService;

    async importFile(options: StagedFileResult): Promise<void> {
        const { path, metadata, uri, displayName, type } = options;

        const fileStat = await stat(path);
        const hash = sha1ByPath(path);

        if (fileStat.isDirectory()) {
            const { type: resourceType, suggestedName, uri, domain } = await parseResourceByPath(ENTRIES, path, type);
            if (!this.resourceService.getResourceByKey(uri)) {
                // resource not existed
                if (domain === 'saves') {
                    // zip and import
                } else if (domain === 'modpacks') {
                    //
                } else if (domain === 'resourcepacks') {
                    // zip and import
                } else {

                }
            }
        } else {
            let resource: Resource | undefined = this.resourceService.getResourceByKey(fileStat.ino);
            let hash: string | undefined;
            let fileType: FileType | 'unknown' = 'unknown';

            const ext = extname(path);
            if (!resource) {
                const readStream = await fileTypeByStream(createReadStream(path));
                const hashStream = createHash('sha1').setEncoding('hex');
                await pipeline(readStream, hashStream);
                fileType = readStream.fileType?.ext ?? 'unknown';
                hash = hashStream.digest('hex');
                resource = this.resourceService.getResourceByKey(hash);
            }
            if (!resource && fileType === 'zip' || ext === '.jar') {
                await this.resourceService.importResource({ path, type: hint });
            }
        }

        await rename(this.getTempPath(sha1(Buffer.from(path))), '');
    }

    async parseFile(options: FileParseOptions): Promise<StagedFileResult> {
        const { path, hint } = options;
        const fileStat = await stat(path);
        const result: StagedFileResult = {
            path,
            type: 'unknown',
            fileType: 'unknown',
            displayName: basename(path),
            metadata: {},
            uri: '',
            existed: false,
        };
        if (fileStat.isDirectory()) {
            const { type: resourceType, suggestedName, uri, metadata, icon } = await parseResourceByPath(ENTRIES, path, hint);
            result.displayName = suggestedName;
            result.existed = !!this.resourceService.getResourceByKey(uri);
            result.type = resourceType as any;
            result.metadata = metadata;
            result.uri = uri;

            await writeFile(this.getTempPath(`${sha1(Buffer.from(path))}.png`), icon);
            await writeFile(this.getTempPath(`${sha1(Buffer.from(path))}.json`), JSON.stringify(metadata));
        } else {
            let resource: Resource | undefined = this.resourceService.getResourceByKey(fileStat.ino);
            let hash: string | undefined;
            let fileType: FileType | 'unknown' = 'unknown';

            const ext = extname(path);
            if (!resource) {
                const readStream = await fileTypeByStream(createReadStream(path));
                const hashStream = createHash('sha1').setEncoding('hex');
                await pipeline(readStream, hashStream);
                fileType = readStream.fileType?.ext ?? 'unknown';
                hash = hashStream.digest('hex');
                resource = this.resourceService.getResourceByKey(hash);
            }
            result.fileType = fileType;
            if (resource) {
                // resource existed
                result.displayName = resource.name;
                result.existed = true;
                result.type = resource.type as any;
                result.metadata = resource.metadata;
                result.uri = resource.source.uri[0];
            } else if (fileType === 'zip' || ext === '.jar' || ext === '.litemod') {
                const { type: resourceType, suggestedName, uri, metadata, icon } = await parseResourceByPath(ENTRIES, path, hint);
                result.displayName = suggestedName;
                result.existed = !!this.resourceService.getResourceByKey(uri);
                result.type = resourceType as any;
                result.metadata = metadata;
                result.uri = uri;

                await writeFile(this.getTempPath(`${sha1(Buffer.from(path))}.png`), icon);
                await writeFile(this.getTempPath(`${sha1(Buffer.from(path))}.json`), JSON.stringify(metadata));
            }
        }
        return result;
    }

    async parseFiles(options: FilesParseOptions): Promise<StagedFileResult[]> {
        const { files } = options;
        return Promise.all(files.map((file) => this.parseFile(file)));
    }
}
