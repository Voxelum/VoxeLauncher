i18next.init({
    lng: navigator.language,
    resources: { en, zh, zh_CN: zh, en_US: en },
}, function (err, t) {
    jqueryI18next.init(i18next, $);
    $('.section').localize();
    $('.bar').localize();
});

$(document).ready(function () {
    $('body').pagepiling({
        // onLeave: function (index, nextIndex, direction) {
        // },
    });
});
$('.menu .item').tab();
$('.dropdown').dropdown();

$('#languages').dropdown({
    onChange: function (src, _, elem) {
        i18next.changeLanguage(elem.attr('value'), (err, r) => {
            $('.section').localize();
            $('.bar').localize();
        })
    }
});

$('#source').dropdown({
    onChange: function (src, _, elem) {
        DOWNLOAD_SOURCE = elem.attr('value');
    }
})

/**
 * @type {'azure' | 'github' | 'auto'}
 */
let DOWNLOAD_SOURCE = 'auto';

$('#downloadFor').attr('data-i18n', `downloadFor.${platform.os}`);

function inGFW() {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(false);
        img.onerror = () => resolve(false);

        img.src = "https://www.google.com";

        setTimeout(() => {
            resolve(true);
        }, 1500);
    })
}

const isInGFW = inGFW();

/**
 * Get the file url by location. Use azure if in china mainland.
 * @param {string} githubUrl github url.
 * @param {string} azureUrl azure url
 */
function getFileUrlFromLocation(githubUrl, azureUrl) {
    return isInGFW
        .then((inside) => inside ? azureUrl : githubUrl)
        .catch(() => {
            console.log(e);
            return githubUrl;
        });
}

function getGithubUrl(name) { return `https://github.com/Voxelum/x-minecraft-launcher/releases/download/v${version}/${name}`; }
function getAzureUrl(name) { return `https://xmcl-release.azureedge.net/releases/${name}`; }

function setupHrefByUrl(elem, azureUrl, githubUrl) {
    window.
    $(elem).click((event) => {
        $(elem).addClass('loading');
        if (DOWNLOAD_SOURCE === 'auto') {
            getFileUrlFromLocation(azureUrl, githubUrl).then((url) => {
                $(elem).attr('href', url);
                $(elem).removeClass('loading');
            })
        } else if (DOWNLOAD_SOURCE === 'github') {
            $(elem).attr('href', githubUrl);
            $(elem).removeClass('loading');
        } else {
            $(elem).attr('href', azureUrl);
            $(elem).removeClass('loading');
        }
    });
}

function buildFromGithub() {
    let releases
    function handleReleases(inReleases) {
        releases = inReleases;
        const latest = releases[0];
        $('#version').text(latest.tag_name);
        if (latest.prerelease) {
            $('#prerelease').css('visibility', 'visible');
        } else {
            $('#prerelease').css('visibility', 'hidden');
        }

        function setupHref(elem, find) {
            const found = latest.assets.find(find);
            if (!found) {
                $(elem).addClass('disabled');
            } else {
                setupHrefByUrl(elem, getAzureUrl(found.name), found.browser_download_url);
            }
        }

        setupHref('[win-web]', a => a.name.indexOf('Web-Setup') !== -1 && a.name.endsWith('.exe'));
        setupHref('[win-zip]', a => a.name.endsWith('win.zip') && a.name.indexOf('ia32') === -1);
        setupHref('[win-setup]', a => a.name.indexOf('-Setup') !== -1 && a.name.endsWith('.exe') && a.name.indexOf('Web') === -1);
        setupHref('[mac-zip]', a => a.name.endsWith('mac.zip'));
        setupHref('[dmg]', a => a.name.endsWith('.dmg'));
        setupHref('[deb]', a => a.name.endsWith('.deb'));
        setupHref('[snap]', a => a.name.endsWith('.snap'));
        setupHref('[appimage]', a => a.name.endsWith('.AppImage'));
        setupHref('[rpm]', a => a.name.endsWith('.rpm'));
    }

    fetch('https://api.github.com/repos/voxelum/x-minecraft-launcher/releases')
        .then(resp => resp.json())
        .then(handleReleases);
}

function buildByVersion() {
    $('#version').text(`v${version}`);
    function setupHref(elem, name) {
        setupHrefByUrl(elem, getAzureUrl(name), getGithubUrl(name));
    }

    setupHref('[win-web]', `xmcl-Web-Setup-${version}.exe`);
    setupHref('[win-zip]', `xmcl-${version}-win.zip`);
    setupHref('[win-setup]', `xmcl-Setup-${version}.exe`);
    setupHref('[mac-zip]', `xmcl-${version}-mac.zip`);
    setupHref('[dmg]', `xmcl-${version}.dmg`);
    setupHref('[deb]', `x-minecraft-launcher_${version}_amd64.deb`);
    setupHref('[snap]', `x-minecraft-launcher_${version}_amd64.snap`);
    setupHref('[appimage]', `xmcl-${version}.AppImage`);
    setupHref('[rpm]', `x-minecraft-launcher-${version}.x86_64.rpm`);
}


switch (platform.os.family) {
    case 'Windows':
        $('[win]').clone().appendTo('[main]');
        break;
    case 'OS X':
        $('[mac]').clone().appendTo('[main]');
        break;
    case 'Ubuntu':
    case 'Debian':
    case 'SuSE':
    case 'Fedora':
    case 'Red Hat':
        $('[linux]').clone().appendTo('[main]');
        break;
}
buildByVersion();
buildFromGithub();