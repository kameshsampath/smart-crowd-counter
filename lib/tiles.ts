export function tileCoordinates(url: string) {
    const params = new URL(url).searchParams
    const values = ["z", "x", "y"].map(key => params.get(key))
    if (values.some(value => value === null || !/^\d{1,7}$/.test(value))) return null
    const [zoom, horizontal, vertical] = values.map(Number)
    return zoom <= 19 && horizontal < 2 ** zoom && vertical < 2 ** zoom ? [zoom, horizontal, vertical] : null
}
