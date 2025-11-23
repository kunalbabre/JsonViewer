export class Toast {
    static show(message, duration = 2000) {
        const toast = document.createElement('div');
        toast.className = 'jv-toast';
        toast.textContent = message;

        document.body.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, duration);
    }
}
