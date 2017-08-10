import uuid from 'uuid'
import modelServer from '../modules/profiles/server'
import modelModpack from '../modules/profiles/modpack'
import settings from '../modules/profiles/settings'
import mixin from '../mixin-state'
import options from '../../shared/options'

export default (store) => {
    store.subscribe((mutation, state) => {
        const type = mutation.type;
        const payload = mutation.payload;
        const rawPaths = type.split('/');
        const paths = rawPaths.slice(0, rawPaths.length - 1)
        const action = rawPaths[rawPaths.length - 1];
        if (type === 'profiles/add') {
            const { id, module } = payload;
            if (!id) {
                console.error(`Unexpect empty id for adding! @${mutation.type}`)
                return
            }
            if (!module) {
                console.error(`Unexpect empty module for adding! @${mutation.type}`)
                return
            }
            paths.push(id)
            if (!module.namespaced) module.namespaced = true;
            // const model = module.type === 'modpack' ? modelModpack : modelServer
            store.registerModule(paths, module);
            store.registerModule(paths.concat('minecraft'), settings.minecraft)
        } else if (type === 'profiles/remove') {
            console.log(`payload ${payload}`)
            if (!payload) {
                console.error(`Unexpect empty payload for removal! @${mutation.type}`)
                return
            }
            paths.push(payload)
            store.unregisterModule(paths);
        } else if (rawPaths.length >= 3 && paths[0] === 'profiles' && paths[2] === 'toggle') { 
            // maybe more generic way to handle this...
            if (payload.forge) {
                store.registerModule(paths.concat('forge'), settings.forge) // register forge module
            }
            if (payload.liteloader) {
                store.registerModule(paths.concat('liteloader'), settings.liteloader) // register liteloader module
            }
            if (payload.optifine) {
                store.registerModule(paths.concat('optifine'), settings.optifine) // register liteloader module
            }
        }
    })
}