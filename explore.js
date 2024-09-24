document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('nav ul li a');
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            navLinks.forEach(nav => nav.classList.remove('active'));
            event.target.classList.add('active');
            const targetPage = event.target.getAttribute('href').substring(1);
            loadPage(targetPage);
        });
    });

    function loadPage(page) {
        fetch(`${page}.html`)
            .then(response => response.text())
            .then(data => {
                document.querySelector('main').innerHTML = data;
                setLanguage(document.getElementById('language-select').value);
            })
            .catch(error => console.error('Error loading page:', error));
    }

    // Load the default page
    loadPage('explore');
});