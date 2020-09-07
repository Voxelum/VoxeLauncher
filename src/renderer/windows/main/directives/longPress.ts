import Vue from 'vue';

Vue.directive('long-press', (el, binding) => {
    let timeout: NodeJS.Timeout;
    el.addEventListener('mousedown', (e) => {
        timeout = setTimeout(() => {
            binding.value.call(undefined, e);
        }, 1000);
    });
    el.addEventListener('dragstart', () => {
        clearTimeout(timeout);
    });
    el.addEventListener('mouseleave', () => {
        clearTimeout(timeout);
    });
    el.addEventListener('mouseup', () => {
        clearTimeout(timeout);
    });
});
