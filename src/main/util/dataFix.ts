import { RESOURCE_FILE_VERSION } from '@main/constant';
import { RESOURCE_PARSER_FORGE } from '@main/entities/resource';
import { ResourceSchema } from '@universal/entities/resource.schema';
import { openFileSystem } from '@xmcl/system';
import { writeJSON } from 'fs-extra';
import { extname, join, relative } from 'path';

export async function fixResourceSchema(filePath: string, schema: ResourceSchema, dataRoot: string) {
    if ('path' in (schema as any) && !schema.location) {
        const relativePath = relative(dataRoot, (schema as any).path);
        const ext = extname(relativePath);
        schema.location = relativePath.slice(0, relativePath.length - ext.length);
    }
    if ('source' in (schema as any)) {
        const source = (schema as any).source;
        schema.uri = source.uri;
        schema.curseforge = source.uri;
        schema.github = source.github;
        schema.date = source.date;
    }

    if (RESOURCE_FILE_VERSION !== schema.version) {
        // fix forge metadata
        if (schema.type === 'forge') {
            const fs = await openFileSystem(join(dataRoot, schema.location + schema.ext));
            const data = await RESOURCE_PARSER_FORGE.parseMetadata(fs);
            fs.close();
            schema.metadata = data;
            schema.version = RESOURCE_FILE_VERSION;
            await writeJSON(filePath, schema);
        }
    }
}
