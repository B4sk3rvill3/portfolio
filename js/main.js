document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('#navbar');
    
    // 1. Change Navbar on Scroll
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });

    // 2. Smooth Scrolling for anchors
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // 3. Simple Intersection Observer for Fade-in effects
    const observerOptions = { threshold: 0.2 };
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = "1";
                entry.target.style.transform = "translateY(0)";
            }
        });
    }, observerOptions);

    document.querySelectorAll('.card').forEach(card => {
        card.style.opacity = "0";
        card.style.transform = "translateY(30px)";
        card.style.transition = "all 0.6s ease-out";
        observer.observe(card);
    });
});

// Highlight the active language link based on the URL
const currentPath = window.location.pathname;
if (currentPath.includes('sr.html')) {
    document.getElementById('sr-link')?.classList.add('active');
} else {
    document.getElementById('en-link')?.classList.add('active');
}

// Optional: Auto-detect Serbian browser language on first visit
if (!localStorage.getItem('lang_set')) {
    const userLang = navigator.language || navigator.userLanguage;
    if (userLang.startsWith('sr') && !currentPath.includes('sr.html')) {
        localStorage.setItem('lang_set', 'true');
        window.location.href = 'sr.html';
    }
}

const contactBtn = document.getElementById('contact-btn');

contactBtn.addEventListener('click', (e) => {
    // We let the default mailto: happen, but we also copy the email
    // just in case the mail app doesn't open.
    const email = "luka.mihajlov.biz@gmail.com";
    navigator.clipboard.writeText(email).then(() => {
        const originalText = contactBtn.innerText;
        contactBtn.innerText = "Email Copied!";
        setTimeout(() => {
            contactBtn.innerText = originalText;
        }, 2000);
    });
});