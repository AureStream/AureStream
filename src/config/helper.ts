import { BaseDirectory, create, exists, writeFile } from '@tauri-apps/plugin-fs';

export async function writeConfigFile(fileName: string, data: Uint8Array) {
    const configExists = await exists(fileName, {
        baseDir: BaseDirectory.AppConfig,
    });
    if (configExists) {
        await writeFile(fileName, data, {
            baseDir: BaseDirectory.AppConfig,
        });
    } else {
        const file = await create(fileName, { baseDir: BaseDirectory.AppConfig });
        await file.write(data);
        await file.close();
    }
}
