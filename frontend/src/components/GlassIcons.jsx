import './GlassIcons.css';

const gradientMapping = {
  blue: 'linear-gradient(hsl(223, 90%, 50%), hsl(208, 90%, 50%))',
  purple: 'linear-gradient(hsl(283, 90%, 50%), hsl(268, 90%, 50%))',
  red: 'linear-gradient(hsl(3, 90%, 50%), hsl(348, 90%, 50%))',
  indigo: 'linear-gradient(hsl(253, 90%, 50%), hsl(238, 90%, 50%))',
  orange: 'linear-gradient(hsl(43, 90%, 50%), hsl(28, 90%, 50%))',
  green: 'linear-gradient(hsl(123, 90%, 40%), hsl(108, 90%, 40%))',
  yellow: 'linear-gradient(hsl(53, 90%, 50%), hsl(38, 90%, 50%))',
  pink: 'linear-gradient(hsl(343, 90%, 50%), hsl(328, 90%, 50%))',
  cyan: 'linear-gradient(hsl(193, 90%, 50%), hsl(178, 90%, 50%))',
};

const GlassIcons = ({ items, className, activeIndex, onItemClick }) => {
  const getBackgroundStyle = color => {
    if (gradientMapping[color]) {
      return { background: gradientMapping[color] };
    }
    return { background: color };
  };

  return (
    <div className={`icon-btns ${className || ''}`}>
      {items.map((item, index) => {
        const isActive = activeIndex === index;
        return (
          <button
            key={index}
            className={`icon-btn ${item.customClass || ''}${isActive ? ' active' : ''}`}
            aria-label={item.label}
            type="button"
            onClick={() => onItemClick?.(index)}
          >
            <span className="icon-btn__back" style={getBackgroundStyle(item.color)}></span>
            <span className="icon-btn__front">
              <span className="icon-btn__icon" aria-hidden="true">
                {item.icon}
              </span>
            </span>
            <span className="icon-btn__label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default GlassIcons;
