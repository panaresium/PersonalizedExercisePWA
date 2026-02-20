import { createElement, Modal, Button, ListGroup, ListItem } from './ui.js';

export const ImportPreviewModal = ({ projects, warnings, onCancel, onConfirm }) => {
    const listItems = projects.map(p => {
        let title = p.originalName;
        if (p.finalName !== p.originalName) {
            title += ` → ${p.finalName}`;
        }

        const mediaInfo = `Media: Found ${p.mediaFound}, Missing ${p.mediaMissing}`;

        return ListItem({
            title: title,
            subtitle: mediaInfo
        });
    });

    const content = createElement('div', 'import-preview-content', {
        style: 'max-height: 50vh; overflow-y: auto; margin-bottom: 10px;'
    });

    if (warnings && warnings.length > 0) {
        const warningEl = createElement('div', 'import-warnings', { style: 'color: orange; margin-bottom: 10px; font-size: 0.9em;' });
        warnings.forEach(w => {
            warningEl.appendChild(createElement('div', null, {}, `⚠️ ${w}`));
        });
        content.appendChild(warningEl);
    }

    content.appendChild(createElement('div', 'form-label', {}, `Found ${projects.length} Project(s)`));
    content.appendChild(ListGroup(listItems));

    return Modal({
        title: "Import Preview",
        children: [content],
        onCancel,
        onConfirm,
        confirmLabel: "Import All"
    });
};

export const ImportResultModal = ({ results, onClose }) => {
    const content = createElement('div', 'import-result-content', {
        style: 'max-height: 50vh; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 4px; font-family: monospace; font-size: 0.85em;'
    });

    results.forEach(res => {
        let icon = '•';
        let color = 'inherit';
        if (res.type === 'success') { icon = '✅'; color = '#4caf50'; }
        if (res.type === 'warning') { icon = '⚠️'; color = '#ff9800'; }
        if (res.type === 'error') { icon = '❌'; color = '#f44336'; }

        const line = createElement('div', null, { style: `color: ${color}; margin-bottom: 4px;` }, `${icon} ${res.message}`);
        content.appendChild(line);
    });

    const copyBtn = Button({
        label: "Copy Log",
        type: 'secondary',
        onClick: () => {
            const text = results.map(r => `[${r.type.toUpperCase()}] ${r.message}`).join('\n');
            navigator.clipboard.writeText(text).then(() => alert("Copied to clipboard!"));
        }
    });

    const container = createElement('div', null, {});
    container.appendChild(content);
    container.appendChild(createElement('div', null, { style: 'margin-top: 10px; text-align: right;' }, copyBtn));

    return Modal({
        title: "Import Report",
        children: [container],
        onCancel: onClose,
        onConfirm: onClose,
        confirmLabel: "Close",
        cancelLabel: ""
    });
};

export const ErrorDetailModal = ({ error, onClose }) => {
    return ImportResultModal({
        results: [{ type: 'error', message: error.message || error.toString() }],
        onClose
    });
};
