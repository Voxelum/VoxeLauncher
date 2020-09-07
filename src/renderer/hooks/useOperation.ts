import { Ref, ref } from '@vue/composition-api';

export function useOperation<T, A = void>(defaultValue: T, operation: (value: T, argument: A) => void | Promise<void>) {
    const data: Ref<T> = ref<T>(defaultValue) as any;
    return {
        data,
        begin(value: T) { data.value = value; },
        cancel() { data.value = defaultValue; },
        operate(argument: A) {
            let value = data.value;
            let result = operation(value, argument);
            if (result) {
                result.finally(() => {
                    data.value = defaultValue;
                });
            } else {
                data.value = defaultValue;
            }
        },
    };
}
