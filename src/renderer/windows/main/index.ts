import '@/assets/google.font.css';
import locales from '@/assets/locales';
import { I18N_KEY, ROUTER_KEY } from '@/constant';
import provideElectron from '@/providers/provideElectron';
import provideServiceProxy from '@/providers/provideServiceProxy';
import provideVueI18n from '@/providers/provideVueI18n';
import provideVuexStore from '@/providers/provideVuexStore';
import SkinView from '@/skin/SkinView.vue';
import TextComponent from '@/TextComponent';
import Vue from 'vue';
import { h, provide, App, createApp } from '@/vue';
import VueI18n from 'vue-i18n';
import VueObserveVisibility from 'vue-observe-visibility';
import VueParticles from 'vue-particles';
import Router from 'vue-router';
import Vuetify from 'vuetify';
import 'vuetify/dist/vuetify.min.css';
import colors from 'vuetify/es5/util/colors';
import Vuex from 'vuex';
import './directives';
import components from './components';
import CurseforgeIcon from './components/CurseforgeIcon.vue';
import ZipFileIcon from './components/ZipFileIcon.vue';
import JarFileIcon from './components/JarFileIcon.vue';
import PackageFileIcon from './components/PackageFileIcon.vue';
import ForgeIcon from './components/ForgeIcon.vue';
import FabricIcon from './components/FabricIcon.vue';
import MainWindow from './MainWindow.vue';
import router from './router';

function configApp(app: App) {
    app.config.productionTip = false;
    app.use(VueI18n);
    app.use(Vuex);
    app.use(Vuetify, {
        icons: {
            curseforge: {
                component: CurseforgeIcon,
            },
            zip: {
                component: ZipFileIcon,
            },
            jar: {
                component: JarFileIcon,
            },
            package: {
                component: PackageFileIcon,
            },
            forge: {
                component: ForgeIcon,
            },
            fabric: {
                component: FabricIcon,
            },
        },
        theme: {
            primary: colors.green,
            // secondary: colors.lime,
            accent: colors.green.accent3,
        },
    });
    app.use(Router);
    app.use(VueObserveVisibility);
    app.use(VueParticles);
    app.component('text-component', TextComponent);
    app.component('skin-view', SkinView);
    components.forEach(([name, comp]) => {
        app.component(name, comp);
    });
}
function startApp() {
    const i18n = provideVueI18n('en', locales);
    const app = createApp({
        router,
        i18n,
        setup() {
            provideElectron();
            provideServiceProxy();
            const store = provideVuexStore();
            provide(I18N_KEY, i18n);
            store.watch((state) => state.setting.locale, (newValue: string, oldValue: string) => {
                console.log(`Locale changed ${oldValue} -> ${newValue}`);
                i18n.locale = newValue;
            });
            provide(ROUTER_KEY, new Proxy(router, {
                get(target, key) {
                    const prop = Reflect.get(target, key);
                    if (prop instanceof Function) {
                        return (prop as Function).bind(target);
                    }
                    return prop;
                },
            }));
            return () => h(MainWindow);
        },
    });
    app.$mount('#app');
}


configApp(Vue);
startApp();
