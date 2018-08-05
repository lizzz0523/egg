import { EGG_DIR } from './config'
import { IndexFile } from './index'

export default async function main(paths: string[]): Promise<void> {
    const indexFile = await IndexFile.holdIndexFileForUpdate(`${EGG_DIR}/index`)
    const cache = await indexFile.readCache()

    await Promise.all(paths.map(path => {
        // 这里应该要检查path的合法性
        return cache.addFileToCache(path)
    }))

    await indexFile.writeCache(cache)
    await indexFile.commitIndexFile()
}