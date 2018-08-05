import { writeSha1File } from './share'

function pad(num: number) {
    return ('00' + (num >> 0)).slice(-2)
}

function date(date: Date) {
    const timestamp = (+date / 1000) >> 0
    const offset = date.getTimezoneOffset()
    const sign = offset > 0 ? '+' : '-'
    
    return `${timestamp} ${sign}${pad(offset/60)}${pad(offset%60)}`
}

export default async function main(tree: string, parents: string[], message: string): Promise<string> {
    let buffer = Buffer.alloc(1 << 14)
    let offset = 0

    write(`tree ${tree}\n`)
    
    for (const parent of parents) {
        write(`parent ${parent}\n`)
    }

    const author = process.env.USER
    const email = `${author}@xxx.com`
    const fdate = date(new Date)

    write(`author ${author} <${email}> ${fdate}\n`)
    write(`committer ${author} <${email}> ${fdate}\n\n`)
    write(message)

    return await writeSha1File(buffer, offset, 'commit')

    function write(value: string): void {
        const length = Buffer.byteLength(value)
    
        if (offset + length > buffer.length) {
            buffer = Buffer.alloc(offset + length).fill(buffer)
        }
    
        offset += buffer.write(value, offset)
    }
}