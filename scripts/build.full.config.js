const baseConfig = require('./build.base.config');

/**
 * @type {import('electron-builder').Configuration}
 */
const config = {
    ...baseConfig,
    nsis: {
        oneClick: false,
        allowToChangeInstallationDirectory: true,
        perMachine: true,
        differentialPackage: true,
    },
    nsisWeb: {
        appPackageUrl: "https://xmcl-release.azureedge.net/releases",
    },
    // fileAssociations: [{
    //     ext: ['xmcl'],
    //     name: 'X Minecraft Launcher App',
    //     role: 'Editor'
    // }],
    dmg: {
        contents: [
            {
                x: 410,
                y: 150,
                type: "link",
                path: "/Applications"
            },
            {
                x: 130,
                y: 150,
                type: "file"
            }
        ]
    },
    mac: {
        icon: "build/icons/icon.icns",
        target: [
            {
                target: "zip"
            },
            {
                target: "dmg"
            }
        ],
        files: [
            "node_modules/7zip-bin/**/*",
            "!dist/electron/static/Acrylic.cs",
            "!node_modules/7zip-bin/linux/**",
            "!node_modules/7zip-bin/win/**"
        ]
    },
    win: {
        icon: "build/icons/icon.ico",
        target: [
            'nsis:x64',
            {
                target: "nsis-web",
                arch: [
                    "x64",
                ]
            },
            {
                target: "zip",
                arch: [
                    "x64",
                ]
            },
        ],
        files: [
            "node_modules/7zip-bin/**/*",
            "!node_modules/7zip-bin/linux/**",
            "!node_modules/7zip-bin/mac/**"
        ]
    },
    linux: {
        icon: "build/icons",
        target: [
            {
                target: "deb"
            },
            {
                target: "rpm"
            },
            {
                target: "AppImage"
            },
            {
                target: "snap"
            }
        ],
        files: [
            "node_modules/7zip-bin/**/*",
            "!dist/electron/static/Acrylic.cs",
            "!node_modules/7zip-bin/win/**",
            "!node_modules/7zip-bin/mac/**"
        ]
    },
    snap: {
        publish: [
            "github"
        ]
    }
}

module.exports = config;
