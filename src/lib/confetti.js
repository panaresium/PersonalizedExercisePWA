export const confetti = () => {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width = window.innerWidth;
  let height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  const particles = [];
  const colors = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#3366FF', '#AF52DE'];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: width / 2,
      y: height / 2,
      r: Math.random() * 6 + 2,
      dx: (Math.random() - 0.5) * 10,
      dy: (Math.random() - 0.5) * 10 - 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.floor(Math.random() * 10) - 10,
      tiltAngle: 0,
      tiltAngleIncremental: (Math.random() * 0.07) + 0.05
    });
  }

  let animationId;
  let startTime = Date.now();

  const update = () => {
    const now = Date.now();
    if (now - startTime > 3000) { // Run for 3 seconds
      cancelAnimationFrame(animationId);
      document.body.removeChild(canvas);
      return;
    }

    ctx.clearRect(0, 0, width, height);

    particles.forEach(p => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.tiltAngle) + 1 + p.r / 2) / 2;
      p.x += Math.sin(p.tiltAngle) * 2;
      p.y += p.dy; // Gravity-ish
      p.x += p.dx;
      p.dy += 0.1; // Gravity

      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
      ctx.stroke();
    });

    animationId = requestAnimationFrame(update);
  };

  update();
};
