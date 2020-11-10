import { RemoteServerInstanceProfile } from '@universal/entities/remote';
import { ModuleOption } from '../root';

interface State {
    profiles: RemoteServerInstanceProfile[];
}

interface Getters {

}

interface Mutations {
    profiles: RemoteServerInstanceProfile[];
}

export type RemoteModule = ModuleOption<State, Getters, Mutations, {}>;
