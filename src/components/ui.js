export const createElement = (tag, className, props = {}, ...children) => {
  const el = document.createElement(tag);
  if (className) el.className = className;

  children.forEach(child => {
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  });

  Object.entries(props).forEach(([key, value]) => {
    if (value === null || value === undefined) return;

    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.substring(2).toLowerCase(), value);
    } else if (key === 'value') {
        el.value = value;
    } else if (key === 'checked') {
        el.checked = value;
    } else if (key === 'disabled') {
        el.disabled = value;
    } else {
      el.setAttribute(key, value);
    }
  });

  return el;
};

export const NavBar = ({ title, leftAction, rightAction }) => {
  const leftEl = leftAction ?
    createElement('button', 'nav-action', { onClick: leftAction.onClick, 'aria-label': leftAction.ariaLabel }, leftAction.label) :
    createElement('div', 'nav-action', {});

  const rightEl = rightAction ?
    createElement('button', 'nav-action', { onClick: rightAction.onClick, 'aria-label': rightAction.ariaLabel }, rightAction.label) :
    createElement('div', 'nav-action', {});

  return createElement('header', 'nav-bar', {},
    leftEl,
    createElement('div', 'nav-title', {}, title),
    rightEl
  );
};

export const ListItem = ({ title, subtitle, onClick, rightLabel, actionButton }) => {
  const actionEl = actionButton ? createElement('button', `list-action-btn ${actionButton.className || ''}`, {
      onClick: (e) => {
          e.stopPropagation();
          actionButton.onClick(e);
      },
      'aria-label': actionButton.ariaLabel
  }, actionButton.label) : null;

  return createElement('div', 'list-item', { onClick },
    createElement('div', 'list-content', {},
      createElement('div', 'list-title', {}, title),
      subtitle ? createElement('div', 'list-subtitle', {}, subtitle) : ''
    ),
    actionEl,
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

export const Modal = ({ title, children, onCancel, onConfirm, confirmLabel = "OK", cancelLabel = "Cancel", confirmType = 'primary' }) => {
  const overlay = createElement('div', 'modal-overlay', { onClick: (e) => { if(e.target === overlay) onCancel(); } });

  const content = createElement('div', 'modal-content', {});
  content.appendChild(createElement('div', 'modal-title', {}, title));

  children.forEach(child => content.appendChild(child));

  const actions = createElement('div', 'modal-actions', {});
  actions.appendChild(Button({ label: cancelLabel, onClick: onCancel, type: 'secondary' }));
  actions.appendChild(Button({ label: confirmLabel, onClick: onConfirm, type: confirmType }));

  content.appendChild(actions);
  overlay.appendChild(content);

  return overlay;
};
