import { EGG_DIR } from './config'
import { IndexFile } from './index'

export default async function main(paths: string[]): Promise<void> {
    const indexFile = await IndexFile.holdIndexFileForUpdate(`${EGG_DIR}/index`)
    const cache = await indexFile.readCache()

    await cache.refreshCache()

    await indexFile.writeCache(cache)
    await indexFile.commitIndexFile()
}