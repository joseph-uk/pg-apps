export const sanitizeName = function (name) {
    return name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
}