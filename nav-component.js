// nav-component.js - Reusable Navigation Component
import { NAV_STRUCTURE, ALL_PAGES, PAGE_CONFIGS, DEFAULT_CONFIG } from './nav-config.js';

export class NavigationComponent {
  constructor(options = {}) {
    this.currentPage = options.currentPage || this.detectCurrentPage();
    this.config = PAGE_CONFIGS[this.currentPage] || DEFAULT_CONFIG;
    this.isAuthenticated = options.isAuthenticated || this.checkAuth();
  }

  // Auto-detect current page from URL
  detectCurrentPage() {
    const path = window.location.pathname;
    const filename = path.split('/').pop() || 'index.html';
    return filename;
  }
  
  // Check if user is authenticated (integrate with your auth system)
  checkAuth() {
    // This checks if your auth.js has set the user
    // Adjust this based on your actual authentication implementation
    if (typeof window.auth !== 'undefined' && window.auth.currentUser) {
      return true;
    }
    // Fallback: check localStorage or sessionStorage
    return localStorage.getItem('userId') !== null || 
           sessionStorage.getItem('userId') !== null;
  }

  // Get all links for mobile (everything user has access to)
  getMobileLinks() {
    const allLinks = [];
    
    // Add public pages
    ['primary', 'secondary', 'tertiary'].forEach(tier => {
      NAV_STRUCTURE[tier].forEach(page => {
        if (!page.hideFromNav) {
          allLinks.push({
            ...page,
            active: page.href === this.currentPage
          });
        }
      });
    });
    
    // Add auth pages if user is authenticated
    if (this.isAuthenticated) {
      NAV_STRUCTURE.auth.forEach(page => {
        if (!page.hideFromNav) {
          allLinks.push({
            ...page,
            active: page.href === this.currentPage
          });
        }
      });
    }
    
    return allLinks;
  }

  // Get filtered links for desktop based on page config
  getDesktopLinks() {
    const desktopIds = this.config.desktop || DEFAULT_CONFIG.desktop;
    
    return desktopIds
      .map(id => ALL_PAGES[id])
      .filter(page => {
        if (!page) return false;
        // Filter out pages that require auth if user is not authenticated
        if (page.requiresAuth && !this.isAuthenticated) return false;
        // Filter out pages marked as hideFromNav
        if (page.hideFromNav) return false;
        return true;
      })
      .map(page => ({
        ...page,
        active: page.href === this.currentPage
      }));
  }

  // Render desktop navigation
  renderDesktop() {
    const links = this.getDesktopLinks();
    
    return `
      <nav class="nav-container">
        ${links.map(link => `
          <a href="${link.href}" class="nav-link ${link.active ? 'active' : ''} ${link.class || ''}">
            ${link.icon} ${link.label}
          </a>
        `).join('')}
      </nav>
    `;
  }

  // Render mobile navigation
  renderMobile() {
    const links = this.getMobileLinks();
    
    return `
      <div class="mobile-nav-container">
        <div class="mobile-nav-header">
          <div class="mobile-nav-title">⚾ Mountainside Aces</div>
          <button class="hamburger-menu" id="mobileMenuBtn" aria-label="Toggle navigation">☰</button>
        </div>
        <nav class="mobile-nav-menu" id="mobileNavMenu">
          ${links.map(link => `
            <a href="${link.href}" class="mobile-nav-item ${link.active ? 'active' : ''}">
              ${link.icon} ${link.label}
            </a>
          `).join('')}
          ${this.isAuthenticated ? `
            <div class="mobile-nav-section-divider">Account</div>
          ` : `
            <div id="mobileAuthSection" class="mobile-nav-item" style="border-top: 1px solid var(--border-color); margin-top: 1rem; padding-top: 1rem;">
              <!-- Auth buttons will be inserted here by auth.js if available -->
            </div>
          `}
        </nav>
      </div>
    `;
  }

  // Render complete navigation (both mobile and desktop)
  render() {
    return {
      mobile: this.renderMobile(),
      desktop: this.renderDesktop()
    };
  }

  // Initialize navigation on page load
  static init(options = {}) {
    const nav = new NavigationComponent(options);
    const { mobile, desktop } = nav.render();
    
    // Insert mobile nav BEFORE page-container (not inside it)
    const pageContainer = document.querySelector('.page-container');
    if (pageContainer) {
      // Insert before the page-container, not inside it
      pageContainer.insertAdjacentHTML('beforebegin', mobile);
    } else {
      // Fallback: insert at start of body if page-container not found
      document.body.insertAdjacentHTML('afterbegin', mobile);
    }
    
    // Insert desktop nav into filters-nav
    const filtersNav = document.querySelector('.filters-nav');
    if (filtersNav) {
      // Replace existing nav-container or prepend if not found
      const existingNav = filtersNav.querySelector('.nav-container');
      if (existingNav) {
        existingNav.outerHTML = desktop;
      } else {
        filtersNav.insertAdjacentHTML('afterbegin', desktop);
      }
    }
    
    // IMPORTANT: Set up event listeners AFTER the HTML is inserted
    // Use setTimeout to ensure DOM has updated
    setTimeout(() => {
      const mobileMenuBtn = document.getElementById('mobileMenuBtn');
      const mobileNavMenu = document.getElementById('mobileNavMenu');
      
      console.log('Setting up mobile menu...', { mobileMenuBtn, mobileNavMenu });
      
      if (mobileMenuBtn && mobileNavMenu) {
        mobileMenuBtn.addEventListener('click', function(e) {
          e.preventDefault();
          console.log('Mobile menu button clicked!'); // Debug log
          mobileNavMenu.classList.toggle('open');
          console.log('Menu open state:', mobileNavMenu.classList.contains('open')); // Debug log
        });
        console.log('✅ Mobile menu event listener attached');
      } else {
        console.error('❌ Mobile nav elements not found!', { mobileMenuBtn, mobileNavMenu });
      }
    }, 0);
    
    // Keep the global function for backwards compatibility
    window.toggleMobileMenu = function() {
      const menu = document.getElementById('mobileNavMenu');
      if (menu) {
        menu.classList.toggle('open');
        console.log('Toggle via global function');
      }
    };
    
    // Listen for auth state changes and refresh navigation if needed
    window.addEventListener('authStateChanged', () => {
      console.log('Auth state changed, refreshing navigation...');
      // Remove old navigation
      document.querySelector('.mobile-nav-container')?.remove();
      document.querySelector('.nav-container')?.remove();
      // Re-initialize with new auth state
      NavigationComponent.init(options);
    });
    
    return nav;
  }
}

// Auto-initialize when loaded as module
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      NavigationComponent.init();
    });
  } else {
    NavigationComponent.init();
  }
}

export default NavigationComponent;