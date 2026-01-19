export const createElement = (tag, className, props = {}, ...children) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  Object.entries(props).forEach(([key, value]) => {
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.substring(2).toLowerCase(), value);
    } else if (key === 'value') {
        el.value = value;
    } else {
      el.setAttribute(key, value);
    }
  });
  children.forEach(child => {
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  });
  return el;
};

export const NavBar = ({ title, leftAction, rightAction }) => {
  const leftEl = leftAction ?
    createElement('button', 'nav-action', { onClick: leftAction.onClick }, leftAction.label) :
    createElement('div', 'nav-action', {}); // spacer

  const rightEl = rightAction ?
    createElement('button', 'nav-action', { onClick: rightAction.onClick }, rightAction.label) :
    createElement('div', 'nav-action', {}); // spacer

  return createElement('header', 'nav-bar', {},
    leftEl,
    createElement('div', 'nav-title', {}, title),
    rightEl
  );
};

export const ListItem = ({ title, subtitle, onClick, rightLabel }) => {
  return createElement('div', 'list-item', { onClick },
    createElement('div', 'list-content', {},
      createElement('div', 'list-title', {}, title),
      subtitle ? createElement('div', 'list-subtitle', {}, subtitle) : ''
    ),
    rightLabel ? createElement('div', 'list-detail', { style: 'color: var(--color-text-secondary); margin-right: 8px;' }, rightLabel) : '',
    createElement('div', 'list-chevron', {}, '›')
  );
};

export const ListGroup = (items) => {
    return createElement('div', 'list-group', {}, ...items);
}

export const Button = ({ label, onClick, type = 'primary', className = '' }) => {
  return createElement('button', `btn btn-${type} ${className}`, { onClick }, label);
};
