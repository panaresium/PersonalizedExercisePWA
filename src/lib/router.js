export class Router {
  constructor(routes, outlet) {
    this.routes = routes;
    this.outlet = outlet;
    this.currentView = null;

    // Bind the listener
    this.onHashChange = this.handleHashChange.bind(this);
  }

  start() {
      window.addEventListener('hashchange', this.onHashChange);
      this.handleHashChange();
  }

  async handleHashChange() {
    const hash = window.location.hash.slice(1) || '/';

    // Simple matching
    let matchedRoute = null;
    let params = {};

    // Normalize hash (remove query strings if any for now)
    const cleanHash = hash.split('?')[0];

    for (const [pattern, viewFactory] of Object.entries(this.routes)) {
        // Simple pattern matching: /projects vs /project/:id
        const patternParts = pattern.split('/');
        const hashParts = cleanHash.split('/');

        // Handle root
        if (pattern === '/' && cleanHash === '/') {
            matchedRoute = viewFactory;
            break;
        }

        if (patternParts.length !== hashParts.length) continue;

        let match = true;
        let tempParams = {};

        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) {
                tempParams[patternParts[i].slice(1)] = hashParts[i];
            } else if (patternParts[i] !== hashParts[i]) {
                match = false;
                break;
            }
        }

        if (match) {
            matchedRoute = viewFactory;
            params = tempParams;
            break;
        }
    }

    if (!matchedRoute && this.routes['*']) {
        matchedRoute = this.routes['*'];
    }

    if (matchedRoute) {
        if (this.currentView && typeof this.currentView.onUnmount === 'function') {
            this.currentView.onUnmount();
        }

        this.outlet.innerHTML = '';
        // View factory should return an instance with a render method
        this.currentView = new matchedRoute(params);
        this.outlet.appendChild(this.currentView.render());

        if (typeof this.currentView.onMount === 'function') {
            this.currentView.onMount();
        }
    }
  }

  static navigate(path) {
      window.location.hash = path;
  }
}
