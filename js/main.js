
import { translations } from './translations.js';

// ─── i18n ────────────────────────────────────────────────────────────────────

function setLanguage(lang) {
    const t = translations[lang];
    if (!t) return;

    document.getElementById('html-root').lang = lang;
    document.title = t['page.title'] ?? document.title;
    localStorage.setItem('lang', lang);

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key] !== undefined) el.innerHTML = t[key];
    });

    document.querySelectorAll('[data-lang]').forEach(link => {
        link.classList.toggle('active', link.getAttribute('data-lang') === lang);
    });
}

// Lang-switch clicks
document.querySelectorAll('[data-lang]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        setLanguage(link.getAttribute('data-lang'));
    });
});

// Auto-detect on first visit, otherwise restore saved preference
const savedLang = localStorage.getItem('lang');
if (!savedLang) {
    const userLang = navigator.language || navigator.userLanguage;
    setLanguage(userLang.startsWith('sr') ? 'sr' : 'en');
} else {
    setLanguage(savedLang);
}

// ─── DOM / scroll ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('#navbar');
    const navToggle = document.querySelector('.nav-toggle');

    window.addEventListener('scroll', () => {
        nav.classList.toggle('scrolled', window.scrollY > 50);
    });

    // Hamburger toggle
    navToggle.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', isOpen);
    });

    // Smooth scroll — skip lang-switch links, close menu on mobile
    document.querySelectorAll('a[href^="#"]:not([data-lang])').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            nav.classList.remove('open');
            navToggle.setAttribute('aria-expanded', 'false');
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    const observerOptions = { threshold: 0.2 };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.card').forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(30px)';
        card.style.transition = 'all 0.6s ease-out';
        observer.observe(card);
    });
});

// ─── Contact button ───────────────────────────────────────────────────────────

const contactBtn = document.getElementById('contact-btn');
if (contactBtn) {
    contactBtn.addEventListener('click', () => {
        const email = 'luka.mihajlov.biz@gmail.com';
        navigator.clipboard.writeText(email).then(() => {
            const lang = localStorage.getItem('lang') || 'en';
            const originalText = contactBtn.innerHTML;
            contactBtn.innerHTML = translations[lang]['contact.copied'];
            setTimeout(() => { contactBtn.innerHTML = originalText; }, 2000);
        });
    });
}

// ─── Pipeline tabs ───────────────────────────────────────────────────────────

document.querySelectorAll('.code-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');

        document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.code-panel').forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        document.querySelector(`.code-panel[data-panel="${target}"]`).classList.add('active');
        document.querySelector('#pipeline .file-name').textContent = tab.textContent;
    });
});

