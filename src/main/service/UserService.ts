import { createhDynamicThrottle as createDynamicThrottle } from '@main/util/trafficAgent';
import { fitMinecraftLauncherProfileData } from '@main/util/userData';
import { MutationKeys } from '@universal/store';
import { UserSchema } from '@universal/store/modules/user.schema';
import { requireNonnull, requireObject, requireString } from '@universal/util/assert';
import { Exception, wrapError } from '@universal/util/exception';
import { AUTH_API_MOJANG, checkLocation, GameProfile, getChallenges, getTextures, invalidate, login, lookup, lookupByName, MojangChallengeResponse, offline, PROFILE_API_MOJANG, refresh, responseChallenges, setTexture, validate } from '@xmcl/user';
import { readFile, readJSON } from 'fs-extra';
import { parse } from 'url';
import { v4 } from 'uuid';
import Service, { Singleton } from './Service';

export interface LauncherProfile {
    /**
     * All the launcher profiles and their configurations.
     */
    profiles: {
        [name: string]: {
            name: string;
            /**
             * The profile type. 
             * Types are custom (manually created by the user), 
             * latest-release (uses the latest stable release), 
             * and latest-snapshot (uses the latest build of Minecraft).
             */
            type: string;
            gameDir: string;
            javaDir: string;
            javaArgs: string;
            /**
             * The version ID that the profile targets. Version IDs are determined in the version.json in every directory in ~/versions
             */
            lastVersionId: string;
            /**
             * An Base64-encoded image which represents the icon of the profile in the profiles menu.
             */
            icon: string;
            created: string;
            /**
             * An ISO 8601 formatted date which represents the last time the profile was used.
             */
            lastUsed: string;
        };
    };
    clientToken: string;
    /**
     * All the logged in accounts. 
     * Every account in this key contains a UUID-hashed map (which is used to save the selected user) 
     * which in turn includes the access token, e-mail, and a profile (which contains the account display name)
     */
    authenticationDatabase: {
        [uuid: string]: {
            accessToken: string;
            username: string;
            profiles: {
                [uuid: string]: {
                    displayName: string;
                };
            };
            properties: object[];
        };
    };
    settings: {};
    /**
     * Contains the UUID-hashed account and the UUID of the currently selected user
     */
    selectedUser: {
        /**
         * The UUID-hashed key of the currently selected account
         */
        account: string;
        /**
         * The UUID of the currently selected player
         */
        profile: string;
    };
}

export interface LoginOptions {
    /**
     * The user username. Can be email or other thing the auth service want.
     */
    username: string;
    /**
     * The password. Maybe empty string.
     */
    password?: string;
    /**
     * The auth service name, like mojang.
     */
    authService?: string;
    /**
     * The profile serivce name, like mojang
     */
    profileService?: string;

    /**
     * Select selected profile after login
     */
    selectProfile?: boolean;
}

export interface RefreshSkinOptions {
    gameProfileId?: string;
    userId?: string;
    force?: boolean;
}

export interface UploadSkinOptions {
    /**
     * The game profile id of this skin
     */
    gameProfileId?: string;
    /**
     * The user id of this skin
     */
    userId?: string;
    /**
     * The skin url. Can be either a http/https url or a file: protocol url.
     */
    url: string;
    /**
     * If the skin is using slim model.
     */
    slim: boolean;
}

export default class UserService extends Service {
    private refreshSkinRecord: Record<string, boolean> = {};

    private lookup = createDynamicThrottle(lookup, (uuid, options = {}) => (options.api ?? PROFILE_API_MOJANG).profile, 2400);

    private validate = createDynamicThrottle(validate, ({ accessToken }, api) => (api ?? AUTH_API_MOJANG).hostName, 2400);

    async save({ mutation }: { mutation: MutationKeys }) {
        switch (mutation) {
            case 'userProfileAdd':
            case 'userProfileRemove':
            case 'userProfileUpdate':
            case 'userGameProfileSelect':
            case 'authService':
            case 'profileService':
            case 'userInvalidate':
            case 'authServiceRemove':
            case 'profileServiceRemove':
                await this.setPersistence({
                    path: this.getPath('user.json'),
                    data: { ...this.state.user },
                    schema: UserSchema,
                });
                break;
            default:
        }
    }

    async getMinecraftAuthDb() {
        let data: LauncherProfile = await readJSON(this.getMinecraftPath('launcher_profile.json')).catch(() => ({}));
        return data;
    }

    async load() {
        let data = await this.getPersistence({ path: this.getPath('user.json'), schema: UserSchema });
        let result: UserSchema = {
            authServices: {},
            profileServices: {},
            users: {},
            selectedUser: {
                id: '',
                profile: '',
            },
            clientToken: '',
        };
        let mcdb = await this.getMinecraftAuthDb();
        fitMinecraftLauncherProfileData(result, data, mcdb);

        this.log(`Load ${Object.keys(result.users).length} users`);

        if (!result.clientToken) {
            result.clientToken = v4().replace(/-/g, '');
        }
        this.commit('userSnapshot', result);
    }

    async init() {
        this.refreshUser();
        if (this.state.user.selectedUser.id === '' && Object.keys(this.state.user.users).length > 0) {
            const [userId, user] = Object.entries(this.state.user.users)[0];
            this.switchUserProfile({
                userId,
                profileId: user.selectedProfile,
            });
        }
    }

    /**
     * Logout and clear current cache.
     */
    async logout() {
        let user = this.getters.user;
        if (this.getters.accessTokenValid) {
            if (user.authService !== 'offline') {
                await invalidate({
                    accessToken: user.accessToken,
                    clientToken: this.state.user.clientToken,
                }, this.getters.authService);
            }
        }
        this.commit('userInvalidate');
    }

    /**
     * Check current ip location and determine wether we need to validate user identity by response challenge.
     * 
     * See `getChallenges` and `submitChallenges`
     */
    @Singleton()
    async checkLocation() {
        if (!this.getters.accessTokenValid) return true;
        let user = this.getters.user;
        if (user.authService !== 'mojang') return true;
        try {
            let result = await checkLocation(user.accessToken);
            this.commit('userSecurity', result);
            return result;
        } catch (e) {
            if (e.error === 'ForbiddenOperationException' && e.errorMessage === 'Current IP is not secured') {
                this.commit('userSecurity', false);
                return false;
            }
            throw e;
        }
    }

    /**
     * Get all the user set challenges for security reasons.
     */
    async getChallenges() {
        if (!this.getters.accessTokenValid) return [];
        let user = this.getters.user;
        if (user.profileService !== 'mojang') return [];
        return getChallenges(user.accessToken);
    }

    async submitChallenges(responses: MojangChallengeResponse[]) {
        if (!this.getters.accessTokenValid) throw new Error('Cannot submit challenge if not logined');
        let user = this.getters.user;
        if (user.authService !== 'mojang') throw new Error('Cannot sumit challenge if login mode is not mojang!');
        if (!(responses instanceof Array)) throw new Error('Expect responses Array!');
        let result = await responseChallenges(user.accessToken, responses);
        this.commit('userSecurity', true);
        return result;
    }

    /**
     * Refresh the user auth status
     */
    async refreshStatus() {
        let user = this.getters.user;

        if (!this.getters.offline) {
            let valid = await this.validate({
                accessToken: user.accessToken,
                clientToken: this.state.user.clientToken,
            }, this.getters.authService).catch((e) => {
                this.error(e);
                return false;
            });

            this.log(`Validate ${user.authService} user access token: ${valid ? 'valid' : 'invalid'}`);

            if (valid) {
                this.checkLocation();
                return;
            }
            try {
                let result = await refresh({
                    accessToken: user.accessToken,
                    clientToken: this.state.user.clientToken,
                }, this.getters.authService);
                this.log(`Refreshed user access token for user: ${user.id}`);
                this.commit('userProfileUpdate', {
                    id: user.id,
                    accessToken: result.accessToken,
                    // profiles: result.availableProfiles,
                    profiles: [],

                    selectedProfile: undefined,
                });
                this.checkLocation();
            } catch (e) {
                this.error(e);
                this.warn(`Invalid current user ${user.id} accessToken!`);
                this.commit('userInvalidate');
            }
        } else {
            this.log(`Current user ${user.id} is offline. Skip to refresh credential.`);
        }
    }


    /**
     * Refresh current skin status
     */
    @Singleton(function (this: Service, o: RefreshSkinOptions = {}) {
        let {
            gameProfileId = this.state.user.selectedUser.profile,
            userId = this.state.user.selectedUser.id,
        } = o ?? {};
        return `${userId}[${gameProfileId}]`;
    })
    async refreshSkin(refreshSkinOptions: RefreshSkinOptions = {}) {
        let {
            gameProfileId = this.state.user.selectedUser.profile,
            userId = this.state.user.selectedUser.id,
            force,
        } = refreshSkinOptions ?? {};
        let user = this.state.user.users[userId];
        let gameProfile = user.profiles[gameProfileId];
        // if no game profile (maybe not logined), return
        if (gameProfile.name === '') return;
        // if user doesn't have a valid access token, return
        if (!this.getters.accessTokenValid) return;

        let userAndProfileId = `${userId}[${gameProfileId}]`;
        let refreshed = this.refreshSkinRecord[userAndProfileId];

        // skip if we have refreshed
        if (refreshed && !force) return;

        let { id, name } = gameProfile;
        try {
            let profile: GameProfile;
            let api = this.state.user.profileServices[user.profileService];
            let compatible = user.profileService === user.authService;
            this.log(`Refresh skin for user ${gameProfile.name} in ${user.profileService} service ${compatible ? 'compatiblely' : 'incompatiblely'}`);

            if (!api) {
                this.warn(`Cannot find the profile service named ${user.profileService}. Use default mojang service`);
            }

            if (compatible) {
                profile = await this.lookup(id, { api });
            } else {
                // use name to look up
                profile = await lookupByName(name, { api });
                if (!profile) throw new Error(`Profile not found named ${name}!`);
                profile = await this.lookup(profile.id, { api });
            }
            let textures = getTextures(profile);
            let skin = textures?.textures.SKIN;

            // mark skin already refreshed
            this.refreshSkinRecord[userAndProfileId] = true;
            if (skin) {
                this.log(`Update the skin for user ${gameProfile.name} in ${user.profileService} service`);
                this.commit('gameProfile', {
                    userId: user.id,
                    profile: {
                        ...gameProfile,
                        textures: { ...(textures?.textures || {}), SKIN: skin },
                    },
                });
            } else {
                this.log(`The user ${gameProfile.name} in ${user.profileService} does not have skin!`);
            }
        } catch (e) {
            this.warn(`Cannot refresh the skin data for user ${name}(${id}) in ${user.profileService}`);
            this.warn(JSON.stringify(e));
        }
    }

    /**
     * Upload the skin to server. If the userId and profileId is not assigned,
     * it will use the selected user and selected profile.
     * 
     * Notice that this operation might fail if the user is not authorized (accessToken is not valid).
     * If that happened, please let user refresh it credential or relogin.
     */
    async uploadSkin(options: UploadSkinOptions) {
        requireObject(options);
        requireNonnull(options.url);
        if (typeof options.slim !== 'boolean') options.slim = false;

        let {
            gameProfileId = this.state.user.selectedUser.profile,
            userId = this.state.user.selectedUser.id,
            url,
            slim,
        } = options;
        let user = this.state.user.users[userId];
        let gameProfile = user.profiles[gameProfileId];

        let parsedUrl = parse(url);
        let data: Buffer | undefined;
        let skinUrl = '';
        if (parsedUrl.protocol === 'file:') {
            data = await readFile(url);
        } else if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
            skinUrl = url;
        } else {
            throw new Error('Unknown url protocol! Require a file or http/https protocol!');
        }

        this.log(`Upload texture ${gameProfile.name}(${gameProfile.id})`);
        return setTexture({
            uuid: gameProfile.id,
            accessToken: user.accessToken,
            type: 'skin',
            texture: {
                metadata: {
                    model: slim ? 'slim' : 'steve',
                },
                url: skinUrl,
                data,
            },
        }, this.getters.profileService);
    }

    /**
     * Save the skin to the disk.
     */
    async saveSkin(options: { url: string; path: string }) {
        requireObject(options);
        requireString(options.url);
        requireString(options.path);
        let { path, url } = options;
        await this.networkManager.downloadFile({ url, destination: path });
    }

    /**
     * Refresh the current user login status
     */
    async refreshUser() {
        if (!this.getters.accessTokenValid) return;
        await this.refreshStatus().catch(_ => _);
    }

    /**
    * Switch user account.
    */
    async switchUserProfile(payload: {
        /**
         * The user id of the user
         */
        userId: string;
        /**
         * The game profile id of the user
         */
        profileId: string;
    }) {
        requireObject(payload);
        requireString(payload.userId);
        requireString(payload.profileId);

        if (payload.profileId === this.state.user.selectedUser.profile
            && payload.userId === this.state.user.selectedUser.id) {
            return;
        }

        this.log(`Switch game profile ${payload.userId} ${payload.profileId}`);
        this.commit('userGameProfileSelect', payload);
        await this.refreshUser();
    }

    async removeUserProfile(userId: string) {
        requireString(userId);
        if (this.state.user.selectedUser.id === userId) {
            const user = Object.values(this.state.user.users).find((u) => !!u.selectedProfile);
            if (!user) {
                this.warn(`No valid user after remove user profile ${userId}!`);
            } else {
                const userId = user.id;
                const profileId = user.selectedProfile;
                this.log(`Switch game profile ${userId} ${profileId}`);
                this.commit('userGameProfileSelect', { userId, profileId });
            }
        }
        this.commit('userProfileRemove', userId);
    }

    /**
     * Login the user by current login mode. Refresh the skin and account information.
     */
    async login(options: LoginOptions) {
        requireObject(options);
        requireString(options.username);

        let {
            username,
            password,
            authService = password ? 'mojang' : 'offline',
            profileService = 'mojang',
        } = options;

        let selectedUserProfile = this.getters.user;
        let usingAuthService = this.state.user.authServices[authService];
        password = password ?? '';

        if (authService !== 'offline' && !usingAuthService) {
            throw new Error(`Cannot find auth service named ${authService}`);
        }

        this.log(`Try login username: ${username} ${password ? 'with password' : 'without password'} to auth ${authService} and profile ${profileService}`);

        let result = authService === 'offline'
            ? offline(username)
            : await login({
                username,
                password,
                requestUser: true,
                clientToken: this.state.user.clientToken,
            }, usingAuthService).catch((e) => {
                if (e.message && e.message.startsWith('getaddrinfo ENOTFOUND')) {
                    throw wrapError(e, { type: 'loginInternetNotConnected' });
                } else if (e.error === 'ForbiddenOperationException'
                    && e.errorMessage === 'Invalid credentials. Invalid username or password.') {
                    throw wrapError(e, { type: 'loginInvalidCredentials' });
                } else if (e.error === 'ForbiddenOperationException'
                    && e.errorMessage === 'Invalid credential information.') {
                    throw wrapError(e, { type: 'loginInvalidCredentials' });
                }
                throw wrapError(e, { type: 'loginGeneral' });
            });

        // this.refreshedSkin = false;

        if (!this.state.user.users[result.user!.id]) {
            this.log(`New user added ${result.user!.id}`);

            this.commit('userProfileAdd', {
                id: result.user!.id || '',
                accessToken: result.accessToken,
                profiles: result.availableProfiles,

                username,
                profileService,
                authService,

                selectedProfile: result.selectedProfile ? result.selectedProfile.id : '',
            });
        } else {
            this.log(`Found existed user ${result.user!.id}. Update the profiles of it`);
            this.commit('userProfileUpdate', {
                id: result.user!.id,
                accessToken: result.accessToken,
                profiles: result.availableProfiles,
                selectedProfile: result.selectedProfile ? result.selectedProfile.id : '',
            });
        }
        if (!this.state.user.selectedUser.id || (options.selectProfile && result.selectedProfile)) {
            this.log(`Select the game profile ${result.selectedProfile.id} in user ${result.user!.id}`);
            this.commit('userGameProfileSelect', {
                profileId: result.selectedProfile.id,
                userId: result.user!.id,
            });
        } else {
            this.log(`No game profiles found for user ${username} in ${authService}, ${profileService} services.`);
            this.pushException({ type: 'userNoProfiles', authService, profileService, username });
        }
    }
}
