export const enableDragAndDrop = (container, itemSelector, onReorder) => {
  let draggedItem = null;
  let placeholder = null;
  let originalIndex = -1;
  let startY = 0;
  let initialTop = 0;

  // Helper to get index of item in container
  const getIndex = (item) => Array.from(container.children).indexOf(item);

  const onDragStart = (e) => {
    const item = e.target.closest(itemSelector);
    if (!item || e.target.closest('.list-action-btn') || e.target.tagName === 'BUTTON') return;

    draggedItem = item;
    originalIndex = getIndex(item);

    // Allow visual feedback
    setTimeout(() => {
        if(draggedItem) draggedItem.classList.add('dragging');
    }, 0);

    // Setup placeholder?
    // Native DragEvent data
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', item.innerHTML); // Required for FF
    }
  };

  const onDragEnd = (e) => {
    if (!draggedItem) return;

    draggedItem.classList.remove('dragging');

    // Check new index
    const newIndex = getIndex(draggedItem);
    if (newIndex !== originalIndex) {
        onReorder(originalIndex, newIndex);
    }

    draggedItem = null;

    // Restore scrolling
    // document.body.style.overflow = '';
  };

  const onDragOver = (e) => {
    e.preventDefault(); // Necessary to allow dropping
    if (!draggedItem) return;

    const afterElement = getDragAfterElement(container, e.clientY);
    if (afterElement == null) {
      container.appendChild(draggedItem);
    } else {
      container.insertBefore(draggedItem, afterElement);
    }
  };

  const getDragAfterElement = (container, y) => {
    const draggableElements = [...container.querySelectorAll(`${itemSelector}:not(.dragging)`)];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  };

  // Event Listeners
  // We use native drag and drop API which works on most modern mobile browsers now
  // However, we need 'draggable="true"' on items.

  // Note: The caller must ensure items have draggable="true"
  // Or we can set it here:
  container.querySelectorAll(itemSelector).forEach(item => {
      item.setAttribute('draggable', 'true');
  });

  container.addEventListener('dragstart', onDragStart);
  container.addEventListener('dragover', onDragOver);
  container.addEventListener('dragend', onDragEnd);

  // Touch Support (Native DnD is still spotty on iOS without polyfill,
  // so we might need a simple touch fallback if this fails.
  // But for this environment, let's try standard API first.
  // Actually, standard API often fails on iOS.
  // Implementing a robust touch drag is complex code.
  // I will use a simple pointer events logic if needed, but 'drag-drop-touch' polyfill is standard.
  // Given constraints, I will rely on standard DnD events.
};
