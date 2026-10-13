/* @ds-bundle: {"format":4,"namespace":"TileDesignSystem_bd97ab","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"TextLink","sourcePath":"components/actions/TextLink.jsx"},{"name":"Footer","sourcePath":"components/footer/Footer.jsx"},{"name":"OptionChip","sourcePath":"components/forms/OptionChip.jsx"},{"name":"SearchInput","sourcePath":"components/forms/SearchInput.jsx"},{"name":"Icon","sourcePath":"components/icons/Icon.jsx"},{"name":"GlobalNav","sourcePath":"components/navigation/GlobalNav.jsx"},{"name":"StickyBar","sourcePath":"components/navigation/StickyBar.jsx"},{"name":"SubNav","sourcePath":"components/navigation/SubNav.jsx"},{"name":"EditorialHero","sourcePath":"components/surfaces/EditorialHero.jsx"},{"name":"ProductMedia","sourcePath":"components/surfaces/ProductMedia.jsx"},{"name":"ProductTile","sourcePath":"components/surfaces/ProductTile.jsx"},{"name":"UtilityCard","sourcePath":"components/surfaces/UtilityCard.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"79d5597ceeeb","components/actions/IconButton.jsx":"611ea97d9255","components/actions/TextLink.jsx":"c229d0a82c85","components/footer/Footer.jsx":"f4ab547ffcb1","components/forms/OptionChip.jsx":"afc3798988f9","components/forms/SearchInput.jsx":"3613f240aeba","components/icons/Icon.jsx":"3d703e7c0f0d","components/navigation/GlobalNav.jsx":"26b738be63ee","components/navigation/StickyBar.jsx":"f97eb168873a","components/navigation/SubNav.jsx":"5cfa681e6f4d","components/surfaces/EditorialHero.jsx":"a54bc38faadf","components/surfaces/ProductMedia.jsx":"a769e3aafed8","components/surfaces/ProductTile.jsx":"4e32a9fb114a","components/surfaces/UtilityCard.jsx":"16ad8d0db34b","ui_kits/website/BuyScreen.jsx":"44afcc748f45","ui_kits/website/HomeScreen.jsx":"bea5da144c16","ui_kits/website/ImpactScreen.jsx":"7ad93ad06030","ui_kits/website/StoreScreen.jsx":"9b42887494a8","ui_kits/website/data.js":"151b49a8b9f9"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.TileDesignSystem_bd97ab = window.TileDesignSystem_bd97ab || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/footer/Footer.jsx
try { (() => {
function Footer({
  note,
  columns = [],
  copyright,
  legalLinks = [],
  region,
  style
}) {
  const fine = {
    font: 'var(--type-fine-print)',
    letterSpacing: 'var(--track-fine-print)',
    lineHeight: 1.5
  };
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--parchment)',
      color: 'var(--ink-80)',
      padding: '64px 22px',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--container-text)',
      margin: '0 auto'
    }
  }, note ? /*#__PURE__*/React.createElement("p", {
    style: {
      ...fine,
      color: 'var(--ink-48)',
      margin: '0 0 var(--space-lg)',
      paddingBottom: 'var(--space-lg)',
      borderBottom: '1px solid var(--hairline)'
    }
  }, note) : null, columns.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
      gap: 'var(--space-lg)'
    }
  }, columns.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.heading
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-caption-strong)',
      letterSpacing: 'var(--track-caption-strong)',
      color: 'var(--ink)',
      marginBottom: 4
    }
  }, c.heading), c.links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    className: "tl-link",
    style: {
      display: 'block',
      font: 'var(--type-dense-link)',
      letterSpacing: 'var(--track-dense-link)',
      fontSize: 14,
      color: 'var(--ink-80)'
    }
  }, l))))) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      ...fine,
      color: 'var(--ink-48)',
      marginTop: 'var(--space-xl)',
      paddingTop: 'var(--space-md)',
      borderTop: '1px solid var(--hairline)',
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px 24px',
      alignItems: 'center'
    }
  }, copyright ? /*#__PURE__*/React.createElement("span", null, copyright) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '4px 0'
    }
  }, legalLinks.map((l, i) => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    className: "tl-link",
    style: {
      color: 'var(--ink-80)',
      padding: '0 10px',
      borderLeft: i ? '1px solid var(--hairline)' : 0,
      paddingLeft: i ? 10 : 0
    }
  }, l))), region ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      color: 'var(--ink-80)'
    }
  }, region) : null)));
}
Object.assign(__ds_scope, { Footer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/footer/Footer.jsx", error: String((e && e.message) || e) }); }

// components/forms/OptionChip.jsx
try { (() => {
function OptionChip({
  label,
  detail,
  swatch,
  thumb,
  selected = false,
  disabled = false,
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-pressed": selected,
    disabled: disabled,
    onClick: disabled ? undefined : onClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      width: '100%',
      boxSizing: 'border-box',
      textAlign: 'left',
      cursor: disabled ? 'default' : 'pointer',
      background: 'var(--white)',
      color: disabled ? 'var(--ink-48)' : 'var(--ink)',
      borderRadius: 'var(--radius-pill)',
      border: selected ? '2px solid var(--color-focus)' : '1px solid var(--hairline)',
      padding: selected ? '11px 15px' : '12px 16px',
      font: 'var(--type-caption)',
      letterSpacing: 'var(--track-caption)',
      ...style
    }
  }, swatch ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: '50%',
      background: swatch,
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
      flex: 'none'
    }
  }) : null, thumb ? /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      flex: 'none',
      display: 'inline-flex'
    }
  }, thumb) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption-strong)',
      letterSpacing: 'var(--track-caption-strong)'
    }
  }, label), detail ? /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      color: 'var(--ink-48)',
      whiteSpace: 'nowrap'
    }
  }, detail) : null);
}
Object.assign(__ds_scope, { OptionChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/OptionChip.jsx", error: String((e && e.message) || e) }); }

// components/icons/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const LUCIDE_SRC = 'https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js';
let loading = null;
function ensureLucide() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.lucide && window.lucide.icons) return Promise.resolve();
  if (!loading) {
    loading = new Promise(res => {
      const s = document.createElement('script');
      s.src = LUCIDE_SRC;
      s.onload = res;
      s.onerror = res;
      document.head.appendChild(s);
    });
  }
  return loading;
}
const pascal = n => String(n).replace(/(^|[-_ ])(\w)/g, (_, a, b) => b.toUpperCase());
function Icon({
  name,
  size = 17,
  strokeWidth = 1.5,
  color = 'currentColor',
  title,
  style,
  ...rest
}) {
  const [, force] = React.useState(0);
  const lib = typeof window !== 'undefined' && window.lucide && window.lucide.icons;
  React.useEffect(() => {
    if (!lib) ensureLucide().then(() => force(x => x + 1));
  }, [lib]);
  let node = lib ? lib[pascal(name)] || lib[name] : null;
  if (node && node[0] === 'svg') node = node[2];
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": title ? undefined : true,
    role: title ? 'img' : undefined,
    style: {
      display: 'inline-block',
      flex: 'none',
      verticalAlign: 'middle',
      ...style
    }
  }, rest), title ? /*#__PURE__*/React.createElement("title", null, title) : null, node ? node.map(([tag, attrs], i) => React.createElement(tag, {
    ...attrs,
    key: i
  })) : null);
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/icons/Icon.jsx", error: String((e && e.message) || e) }); }

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  cursor: 'pointer',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  border: '1px solid transparent',
  boxSizing: 'border-box',
  margin: 0,
  fontFamily: 'var(--font-text)'
};
const PILL_SIZES = {
  sm: {
    padding: '5px 13px',
    font: '400 14px/1.29 var(--font-text)',
    letterSpacing: '-0.224px'
  },
  md: {
    padding: '11px 22px',
    font: '400 17px/1.18 var(--font-text)',
    letterSpacing: '-0.374px'
  },
  lg: {
    padding: '14px 28px',
    font: 'var(--type-button-large)',
    letterSpacing: 'var(--track-button-large)'
  }
};
function Button({
  variant = 'primary',
  size = 'md',
  onDark = false,
  disabled = false,
  href,
  icon,
  iconRight,
  children,
  style,
  onClick,
  ...rest
}) {
  let v;
  if (variant === 'dark') {
    v = {
      background: 'var(--ink)',
      color: 'var(--text-on-dark)',
      borderRadius: 'var(--radius-sm)',
      padding: '8px 15px',
      font: 'var(--type-button-utility)',
      letterSpacing: 'var(--track-button-utility)'
    };
  } else if (variant === 'pearl') {
    v = {
      background: 'var(--surface-button-pearl)',
      color: 'var(--ink-80)',
      border: '3px solid var(--divider-soft)',
      borderRadius: 'var(--radius-md)',
      padding: '8px 14px',
      font: 'var(--type-caption)',
      letterSpacing: 'var(--track-caption)'
    };
  } else if (variant === 'secondary') {
    const c = onDark ? 'var(--color-action-on-dark)' : 'var(--color-action)';
    v = {
      background: 'transparent',
      color: c,
      borderColor: c,
      borderRadius: 'var(--radius-pill)',
      ...PILL_SIZES[size]
    };
  } else {
    v = {
      background: 'var(--color-action)',
      color: 'var(--text-on-action)',
      borderRadius: 'var(--radius-pill)',
      ...PILL_SIZES[size]
    };
  }
  if (disabled) {
    v = {
      ...v,
      color: 'var(--ink-48)',
      cursor: 'default',
      background: variant === 'secondary' ? 'transparent' : 'var(--parchment)',
      borderColor: variant === 'secondary' ? 'var(--hairline)' : variant === 'pearl' ? 'var(--divider-soft)' : 'transparent'
    };
  }
  const Tag = href && !disabled ? 'a' : 'button';
  const iconSize = variant === 'primary' || variant === 'secondary' ? size === 'sm' ? 13 : 16 : 14;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: disabled ? undefined : 'tl-press',
    href: Tag === 'a' ? href : undefined,
    type: Tag === 'button' ? 'button' : undefined,
    disabled: Tag === 'button' ? disabled : undefined,
    "aria-disabled": disabled || undefined,
    onClick: disabled ? undefined : onClick,
    style: {
      ...BASE,
      ...v,
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: iconSize
  }) : null, children, iconRight ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconRight,
    size: iconSize
  }) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/actions/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function IconButton({
  icon,
  label,
  size = 44,
  onClick,
  disabled = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    title: label,
    onClick: disabled ? undefined : onClick,
    disabled: disabled,
    className: disabled ? undefined : 'tl-press',
    style: {
      width: size,
      height: size,
      borderRadius: 'var(--radius-full)',
      border: 0,
      padding: 0,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--surface-chip)',
      color: disabled ? 'var(--ink-48)' : 'var(--ink)',
      cursor: disabled ? 'default' : 'pointer',
      backdropFilter: 'var(--blur-frosted)',
      WebkitBackdropFilter: 'var(--blur-frosted)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: Math.round(size * 0.41),
    strokeWidth: 2
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/actions/TextLink.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const SIZES = {
  caption: {
    font: 'var(--type-caption)',
    letterSpacing: 'var(--track-caption)',
    icon: 10
  },
  body: {
    font: 'var(--type-body)',
    letterSpacing: 'var(--track-body)',
    icon: 12
  },
  lead: {
    font: 'var(--type-tagline)',
    fontWeight: 400,
    letterSpacing: 'var(--track-tagline)',
    icon: 15
  }
};
function TextLink({
  href = '#',
  onDark = false,
  chevron = false,
  size = 'body',
  children,
  onClick,
  style,
  ...rest
}) {
  const s = SIZES[size] || SIZES.body;
  return /*#__PURE__*/React.createElement("a", _extends({
    href: href,
    className: "tl-link",
    onClick: onClick,
    style: {
      color: onDark ? 'var(--color-action-on-dark)' : 'var(--color-action)',
      font: s.font,
      fontWeight: s.fontWeight,
      letterSpacing: s.letterSpacing,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 2,
      cursor: 'pointer',
      ...style
    }
  }, rest), children, chevron ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: s.icon,
    strokeWidth: 2
  }) : null);
}
Object.assign(__ds_scope, { TextLink });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/TextLink.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchInput.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function SearchInput({
  value,
  defaultValue,
  onChange,
  onSubmit,
  placeholder = 'Search',
  width = '100%',
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("form", {
    className: "tl-input",
    onSubmit: e => {
      e.preventDefault();
      onSubmit && onSubmit(e.currentTarget.q.value);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: 44,
      padding: '0 20px',
      width,
      boxSizing: 'border-box',
      background: 'var(--white)',
      border: '1px solid var(--hairline-alpha)',
      borderRadius: 'var(--radius-pill)',
      color: 'var(--ink)',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 14,
    color: "var(--ink-48)",
    strokeWidth: 2
  }), /*#__PURE__*/React.createElement("input", _extends({
    name: "q",
    type: "search",
    value: value,
    defaultValue: defaultValue,
    placeholder: placeholder,
    onChange: onChange ? e => onChange(e.target.value) : undefined,
    style: {
      flex: 1,
      minWidth: 0,
      border: 0,
      outline: 'none',
      background: 'transparent',
      padding: 0,
      font: 'var(--type-body)',
      letterSpacing: 'var(--track-body)',
      color: 'inherit'
    }
  }, rest)));
}
Object.assign(__ds_scope, { SearchInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchInput.jsx", error: String((e && e.message) || e) }); }

// components/navigation/GlobalNav.jsx
try { (() => {
function GlobalNav({
  brand = 'Tile',
  links = [],
  active,
  onNavigate,
  onSearch,
  onBag,
  bagCount = 0,
  sticky = true,
  style
}) {
  const go = id => e => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(id);
    }
  };
  const item = {
    color: 'var(--text-on-dark)',
    font: 'var(--type-nav-link)',
    letterSpacing: 'var(--track-nav-link)',
    background: 'none',
    border: 0,
    padding: 0,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center'
  };
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      position: sticky ? 'sticky' : 'relative',
      top: 0,
      zIndex: 100,
      height: 'var(--nav-global-h)',
      background: 'var(--surface-nav)',
      color: 'var(--text-on-dark)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1024,
      height: '100%',
      margin: '0 auto',
      padding: '0 22px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 20,
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: go('home'),
    className: "tl-nav-link",
    style: {
      ...item,
      opacity: 1,
      font: '600 17px/1 var(--font-display)',
      letterSpacing: '-0.3px'
    }
  }, brand), links.map(l => {
    const id = typeof l === 'string' ? l : l.id;
    const label = typeof l === 'string' ? l : l.label;
    return /*#__PURE__*/React.createElement("a", {
      key: id,
      href: "#",
      onClick: go(id),
      className: "tl-nav-link",
      style: {
        ...item,
        opacity: active === id ? 1 : undefined
      }
    }, label);
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Search",
    onClick: onSearch,
    className: "tl-nav-link",
    style: item
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 15
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    "aria-label": "Bag",
    onClick: onBag,
    className: "tl-nav-link",
    style: {
      ...item,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "shopping-bag",
    size: 15
  }), bagCount > 0 ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      right: -7,
      bottom: -5,
      minWidth: 13,
      height: 13,
      borderRadius: 7,
      background: 'var(--text-on-dark)',
      color: 'var(--black)',
      font: '600 9px/13px var(--font-text)',
      textAlign: 'center',
      padding: '0 3px',
      boxSizing: 'border-box'
    }
  }, bagCount) : null)));
}
Object.assign(__ds_scope, { GlobalNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/GlobalNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/StickyBar.jsx
try { (() => {
function StickyBar({
  label,
  price,
  note,
  cta = 'Add to Bag',
  onCta,
  ctaDisabled = false,
  fixed = true,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: fixed ? 'fixed' : 'relative',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 80,
      height: 'var(--sticky-bar-h)',
      padding: '12px 32px',
      boxSizing: 'border-box',
      background: 'var(--surface-frosted)',
      backdropFilter: 'var(--blur-frosted)',
      WebkitBackdropFilter: 'var(--blur-frosted)',
      borderTop: '1px solid var(--hairline-alpha)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 24,
      color: 'var(--ink)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 12,
      minWidth: 0
    }
  }, label ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body-strong)',
      letterSpacing: 'var(--track-body-strong)',
      whiteSpace: 'nowrap'
    }
  }, label) : null, price ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-body)',
      letterSpacing: 'var(--track-body)'
    }
  }, price) : null, note ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: 'var(--type-caption)',
      letterSpacing: 'var(--track-caption)',
      color: 'var(--ink-48)',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, note) : null), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    onClick: onCta,
    disabled: ctaDisabled
  }, cta));
}
Object.assign(__ds_scope, { StickyBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/StickyBar.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SubNav.jsx
try { (() => {
function SubNav({
  title,
  links = [],
  active,
  onNavigate,
  cta,
  onCta,
  top = 0,
  sticky = true,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: sticky ? 'sticky' : 'relative',
      top,
      zIndex: 90,
      height: 'var(--nav-sub-h)',
      background: 'var(--surface-frosted)',
      backdropFilter: 'var(--blur-frosted)',
      WebkitBackdropFilter: 'var(--blur-frosted)',
      borderBottom: '1px solid var(--hairline-alpha)',
      color: 'var(--ink)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1024,
      height: '100%',
      margin: '0 auto',
      padding: '0 22px',
      display: 'flex',
      alignItems: 'center',
      gap: 24,
      boxSizing: 'border-box'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-tagline)',
      letterSpacing: 'var(--track-tagline)',
      marginRight: 'auto',
      whiteSpace: 'nowrap'
    }
  }, title), links.map(l => {
    const id = typeof l === 'string' ? l : l.id;
    const label = typeof l === 'string' ? l : l.label;
    const on = active === id;
    return /*#__PURE__*/React.createElement("a", {
      key: id,
      href: "#",
      onClick: e => {
        if (onNavigate) {
          e.preventDefault();
          onNavigate(id);
        }
      },
      style: {
        font: 'var(--type-fine-print)',
        letterSpacing: 'var(--track-fine-print)',
        color: on ? 'var(--ink-48)' : 'var(--ink)',
        textDecoration: 'none',
        cursor: on ? 'default' : 'pointer',
        whiteSpace: 'nowrap'
      }
    }, label);
  }), cta ? /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "sm",
    onClick: onCta
  }, cta) : null));
}
Object.assign(__ds_scope, { SubNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SubNav.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/EditorialHero.jsx
try { (() => {
function EditorialHero({
  image,
  emblem,
  title,
  lead,
  cta,
  onCta,
  minHeight = 560,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      minHeight,
      background: 'var(--tile-1)',
      color: 'var(--text-on-dark)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: 'var(--space-section) 24px',
      boxSizing: 'border-box',
      overflow: 'hidden',
      ...style
    }
  }, image ? /*#__PURE__*/React.createElement("img", {
    src: image,
    alt: "",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 'var(--space-md)',
      maxWidth: 760
    }
  }, emblem ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-tagline)',
      letterSpacing: 'var(--track-tagline)'
    }
  }, emblem) : null, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      font: 'var(--type-display-lg)',
      letterSpacing: 'var(--track-display-lg)',
      textWrap: 'balance'
    }
  }, title), lead ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: 0,
      font: 'var(--type-lead-airy)',
      letterSpacing: 'var(--track-lead-airy)',
      color: 'var(--text-on-dark-muted)',
      textWrap: 'pretty'
    }
  }, lead) : null, cta ? /*#__PURE__*/React.createElement(__ds_scope.Button, {
    onClick: onCta,
    style: {
      marginTop: 'var(--space-xs)'
    }
  }, cta) : null));
}
Object.assign(__ds_scope, { EditorialHero });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/EditorialHero.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/ProductMedia.jsx
try { (() => {
function ProductMedia({
  src,
  alt = '',
  label = 'Product render',
  aspect = '16 / 9',
  onDark = false,
  radius = 0,
  fit = 'contain',
  shadow = true,
  style
}) {
  if (src) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        aspectRatio: aspect,
        width: '100%',
        borderRadius: radius,
        overflow: radius ? 'hidden' : 'visible',
        ...style
      }
    }, /*#__PURE__*/React.createElement("img", {
      src: src,
      alt: alt,
      style: {
        width: '100%',
        height: '100%',
        objectFit: fit,
        display: 'block',
        filter: shadow && fit === 'contain' ? 'drop-shadow(3px 5px 30px rgba(0,0,0,0.22))' : 'none'
      }
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    role: "img",
    "aria-label": alt || label,
    style: {
      aspectRatio: aspect,
      width: '100%',
      borderRadius: radius,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: onDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.035)',
      color: onDark ? 'rgba(255,255,255,0.45)' : 'var(--ink-48)',
      font: 'var(--type-caption)',
      letterSpacing: 'var(--track-caption)',
      ...style
    }
  }, label);
}
Object.assign(__ds_scope, { ProductMedia });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/ProductMedia.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/ProductTile.jsx
try { (() => {
const TONES = {
  light: {
    bg: 'var(--white)',
    dark: false
  },
  parchment: {
    bg: 'var(--parchment)',
    dark: false
  },
  dark: {
    bg: 'var(--tile-1)',
    dark: true
  },
  dark2: {
    bg: 'var(--tile-2)',
    dark: true
  },
  dark3: {
    bg: 'var(--tile-3)',
    dark: true
  },
  black: {
    bg: 'var(--black)',
    dark: true
  }
};
function ProductTile({
  tone = 'light',
  size = 'md',
  eyebrow,
  title,
  tagline,
  primary,
  secondary,
  onPrimary,
  onSecondary,
  media,
  mediaLabel,
  mediaAspect = '16 / 9',
  children,
  style
}) {
  const t = TONES[tone] || TONES.light;
  const hero = size === 'hero';
  const compact = size === 'half';
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: t.bg,
      color: t.dark ? 'var(--text-on-dark)' : 'var(--ink)',
      borderRadius: 0,
      padding: compact ? '52px 24px 0' : 'var(--space-section) 24px 0',
      textAlign: 'center',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      ...style
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-tagline)',
      letterSpacing: 'var(--track-tagline)',
      marginBottom: 6
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: 0,
      font: hero ? 'var(--type-hero)' : 'var(--type-display-lg)',
      letterSpacing: hero ? 'var(--track-hero)' : 'var(--track-display-lg)',
      textWrap: 'balance'
    }
  }, title), tagline ? /*#__PURE__*/React.createElement("p", {
    style: {
      margin: '6px 0 0',
      font: compact ? 'var(--type-tagline)' : 'var(--type-lead)',
      fontWeight: 400,
      letterSpacing: compact ? 'var(--track-tagline)' : 'var(--track-lead)',
      textWrap: 'balance'
    }
  }, tagline) : null, primary || secondary ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 'var(--space-md)',
      justifyContent: 'center',
      flexWrap: 'wrap',
      marginTop: 'var(--space-lg)'
    }
  }, primary ? /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: compact ? 'sm' : 'md',
    onClick: onPrimary
  }, primary) : null, secondary ? /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: compact ? 'sm' : 'md',
    variant: "secondary",
    onDark: t.dark,
    onClick: onSecondary
  }, secondary) : null) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: compact ? 640 : 1024,
      marginTop: 'var(--space-xxl)'
    }
  }, children || /*#__PURE__*/React.createElement(__ds_scope.ProductMedia, {
    src: media,
    label: mediaLabel,
    aspect: mediaAspect,
    onDark: t.dark
  })));
}
Object.assign(__ds_scope, { ProductTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/ProductTile.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/UtilityCard.jsx
try { (() => {
function UtilityCard({
  name,
  price,
  image,
  imageLabel = 'Product image',
  eyebrow,
  link = 'Buy',
  onClick,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    style: {
      background: 'var(--surface-card)',
      border: 'var(--border-card)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-lg)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-sm)',
      cursor: onClick ? 'pointer' : 'default',
      color: 'var(--ink)',
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.ProductMedia, {
    src: image,
    label: imageLabel,
    aspect: "1 / 1",
    radius: 8,
    style: image ? undefined : {
      background: 'var(--parchment)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      marginTop: 'var(--space-xs)'
    }
  }, eyebrow ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-fine-print)',
      letterSpacing: 'var(--track-fine-print)',
      color: 'var(--ink-48)',
      marginBottom: 4
    }
  }, eyebrow) : null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-body-strong)',
      letterSpacing: 'var(--track-body-strong)'
    }
  }, name), price ? /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--type-body)',
      letterSpacing: 'var(--track-body)'
    }
  }, price) : null), link ? /*#__PURE__*/React.createElement(__ds_scope.TextLink, {
    chevron: true,
    onClick: e => {
      e.preventDefault();
    }
  }, link) : null);
}
Object.assign(__ds_scope, { UtilityCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/UtilityCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/BuyScreen.jsx
try { (() => {
(() => {
  const {
    SubNav,
    ProductMedia,
    IconButton,
    OptionChip,
    StickyBar,
    TextLink
  } = window.TileDesignSystem_bd97ab;
  const MODELS = [{
    id: 'pro',
    label: 'Aero Pro',
    detail: 'From $999',
    base: 999
  }, {
    id: 'max',
    label: 'Aero Pro Max',
    detail: 'From $1,199',
    base: 1199
  }];
  const FINISHES = [{
    id: 'slate',
    label: 'Slate',
    swatch: '#3b3b3d'
  }, {
    id: 'sand',
    label: 'Sand',
    swatch: '#d9cfc1'
  }, {
    id: 'mist',
    label: 'Mist',
    swatch: '#c9d3dc'
  }, {
    id: 'white',
    label: 'White',
    swatch: '#f2f2f0'
  }];
  const STORAGE = [{
    id: 256,
    label: '256 GB',
    add: 0
  }, {
    id: 512,
    label: '512 GB',
    add: 200
  }, {
    id: 1024,
    label: '1 TB',
    add: 400
  }];
  const fmt = n => '$' + n.toLocaleString('en-US');
  function Section({
    title,
    hint,
    children
  }) {
    return /*#__PURE__*/React.createElement("section", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-sm)'
      }
    }, /*#__PURE__*/React.createElement("h3", {
      style: {
        margin: 0,
        font: 'var(--type-tagline)',
        letterSpacing: 'var(--track-tagline)'
      }
    }, title, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-48)'
      }
    }, hint)), children);
  }
  function BuyScreen({
    onAdd
  }) {
    const [model, setModel] = React.useState('pro');
    const [finish, setFinish] = React.useState('slate');
    const [storage, setStorage] = React.useState(256);
    const [slide, setSlide] = React.useState(0);
    const m = MODELS.find(x => x.id === model);
    const s = STORAGE.find(x => x.id === storage);
    const f = FINISHES.find(x => x.id === finish);
    const total = m.base + s.add;
    return /*#__PURE__*/React.createElement("main", {
      style: {
        background: 'var(--white)',
        paddingBottom: 64
      }
    }, /*#__PURE__*/React.createElement(SubNav, {
      title: "Buy Aero Pro",
      links: [{
        id: 'o',
        label: 'Overview'
      }, {
        id: 't',
        label: 'Tech Specs'
      }, {
        id: 'c',
        label: 'Compare'
      }],
      top: 44
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 1180,
        margin: '0 auto',
        padding: '48px 24px 80px'
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: '0 0 6px',
        font: 'var(--type-hero)',
        letterSpacing: 'var(--track-hero)'
      }
    }, "Buy Aero Pro"), /*#__PURE__*/React.createElement("p", {
      style: {
        margin: '0 0 var(--space-xxl)',
        font: 'var(--type-caption)',
        letterSpacing: 'var(--track-caption)',
        color: 'var(--ink-80)'
      }
    }, "From $41.62/mo. for 24 mo. or $999 before trade-in. ", /*#__PURE__*/React.createElement(TextLink, {
      size: "caption",
      chevron: true
    }, "Get help buying")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
        gap: 48,
        alignItems: 'start'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'sticky',
        top: 120,
        background: 'var(--parchment)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement(ProductMedia, {
      aspect: "1 / 1",
      label: 'Aero Pro — ' + f.label + ' · view ' + (slide + 1) + ' of 3'
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'absolute',
        right: 16,
        bottom: 16,
        display: 'flex',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: "chevron-left",
      label: "Previous",
      size: 36,
      onClick: () => setSlide((slide + 2) % 3)
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "chevron-right",
      label: "Next",
      size: 36,
      onClick: () => setSlide((slide + 1) % 3)
    }))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-xxl)'
      }
    }, /*#__PURE__*/React.createElement(Section, {
      title: "Model.",
      hint: "Which is best for you?"
    }, MODELS.map(o => /*#__PURE__*/React.createElement(OptionChip, {
      key: o.id,
      label: o.label,
      detail: o.detail,
      selected: model === o.id,
      onClick: () => setModel(o.id)
    }))), /*#__PURE__*/React.createElement(Section, {
      title: "Finish.",
      hint: "Pick your favorite."
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--space-sm)'
      }
    }, FINISHES.map(o => /*#__PURE__*/React.createElement(OptionChip, {
      key: o.id,
      label: o.label,
      swatch: o.swatch,
      selected: finish === o.id,
      onClick: () => setFinish(o.id)
    })))), /*#__PURE__*/React.createElement(Section, {
      title: "Storage.",
      hint: "How much space do you need?"
    }, STORAGE.map(o => /*#__PURE__*/React.createElement(OptionChip, {
      key: o.id,
      label: o.label,
      detail: o.add ? '+ ' + fmt(o.add) : fmt(m.base),
      selected: storage === o.id,
      onClick: () => setStorage(o.id)
    })))))), /*#__PURE__*/React.createElement(StickyBar, {
      label: m.label + ' ' + s.label + ' ' + f.label,
      price: fmt(total),
      note: "Free delivery \xB7 In stock",
      onCta: () => onAdd(m.label + ' ' + s.label)
    }));
  }
  window.BuyScreen = BuyScreen;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/BuyScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/HomeScreen.jsx
try { (() => {
(() => {
  const {
    ProductTile
  } = window.TileDesignSystem_bd97ab;
  function HomeScreen({
    go
  }) {
    return /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement(ProductTile, {
      size: "hero",
      title: "Aero Pro",
      tagline: "Titanium light. All-day bright.",
      primary: "Learn more",
      secondary: "Buy",
      onPrimary: () => go('buy'),
      onSecondary: () => go('buy'),
      mediaAspect: "21 / 9",
      mediaLabel: "Hero render \u2014 Aero Pro"
    }), /*#__PURE__*/React.createElement(ProductTile, {
      tone: "dark",
      title: "Aero",
      tagline: "A total powerhouse.",
      primary: "Learn more",
      secondary: "Buy",
      onPrimary: () => go('buy'),
      onSecondary: () => go('buy'),
      mediaAspect: "21 / 9",
      mediaLabel: "Product render \u2014 Aero"
    }), /*#__PURE__*/React.createElement(ProductTile, {
      tone: "parchment",
      title: "Slate",
      tagline: "Thin enough to disappear.",
      primary: "Learn more",
      secondary: "Buy",
      onSecondary: () => go('store'),
      mediaAspect: "21 / 9",
      mediaLabel: "Product render \u2014 Slate"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))',
        gap: 12,
        padding: 12,
        background: 'var(--white)'
      }
    }, /*#__PURE__*/React.createElement(ProductTile, {
      size: "half",
      tone: "dark2",
      title: "Pulse",
      tagline: "Every beat, beautifully.",
      primary: "Learn more",
      secondary: "Buy",
      mediaAspect: "4 / 3",
      mediaLabel: "Product render \u2014 Pulse"
    }), /*#__PURE__*/React.createElement(ProductTile, {
      size: "half",
      tone: "parchment",
      title: "Echo Buds Pro",
      tagline: "Hear the room disappear.",
      primary: "Learn more",
      secondary: "Buy",
      onSecondary: () => go('store'),
      mediaAspect: "4 / 3",
      mediaLabel: "Product render \u2014 Echo Buds"
    }), /*#__PURE__*/React.createElement(ProductTile, {
      size: "half",
      tone: "parchment",
      eyebrow: "Environment",
      title: "Less, by design.",
      tagline: "Our path to carbon neutral.",
      primary: "Learn more",
      onPrimary: () => go('impact'),
      mediaAspect: "4 / 3",
      mediaLabel: "Editorial photograph"
    }), /*#__PURE__*/React.createElement(ProductTile, {
      size: "half",
      tone: "dark3",
      title: "Trade In",
      tagline: "Get credit toward a new Aero.",
      primary: "Get your estimate",
      mediaAspect: "4 / 3",
      mediaLabel: "Product render \u2014 trade in"
    })));
  }
  window.HomeScreen = HomeScreen;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/ImpactScreen.jsx
try { (() => {
(() => {
  const {
    EditorialHero,
    ProductTile,
    TextLink
  } = window.TileDesignSystem_bd97ab;
  function Stat({
    value,
    label
  }) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--type-display-lg)',
        letterSpacing: 'var(--track-display-lg)'
      }
    }, value), /*#__PURE__*/React.createElement("div", {
      style: {
        font: 'var(--type-body)',
        letterSpacing: 'var(--track-body)',
        color: 'var(--ink-80)'
      }
    }, label));
  }
  function ImpactScreen({
    go
  }) {
    return /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement(EditorialHero, {
      emblem: "Tile 2030",
      title: "Carbon neutral across everything we make. By 2030.",
      lead: "Not someday. A plan with a date.",
      cta: "Read the report",
      minHeight: 620
    }), /*#__PURE__*/React.createElement("section", {
      style: {
        background: 'var(--white)',
        padding: '80px 24px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 'var(--container-text)',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-xxl)'
      }
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        margin: 0,
        font: 'var(--type-lead-airy)',
        letterSpacing: 'var(--track-lead-airy)',
        maxWidth: 760,
        textWrap: 'pretty'
      }
    }, "We design every product to leave less behind \u2014 from the materials we choose, to the energy that builds them, to what happens when you're done with them."), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 'var(--space-xl)'
      }
    }, /*#__PURE__*/React.createElement(Stat, {
      value: "75%",
      label: "Reduction in emissions since 2015."
    }), /*#__PURE__*/React.createElement(Stat, {
      value: "100%",
      label: "Recycled aluminum in every Slate enclosure."
    }), /*#__PURE__*/React.createElement(Stat, {
      value: "0",
      label: "Plastic in our packaging."
    })), /*#__PURE__*/React.createElement(TextLink, {
      chevron: true,
      size: "lead"
    }, "Explore our progress"))), /*#__PURE__*/React.createElement(ProductTile, {
      tone: "parchment",
      title: "Trade in. Trade up.",
      tagline: "Turn the device you have into credit toward a new one.",
      primary: "Get your estimate",
      secondary: "Learn more",
      mediaAspect: "21 / 9",
      mediaLabel: "Editorial photograph \u2014 recycling"
    }));
  }
  window.ImpactScreen = ImpactScreen;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/ImpactScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/StoreScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
(() => {
  const {
    SubNav,
    SearchInput,
    UtilityCard,
    TextLink
  } = window.TileDesignSystem_bd97ab;
  function StoreScreen({
    go
  }) {
    const [q, setQ] = React.useState('');
    const items = window.TILE_DATA.accessories.filter(a => a.name.toLowerCase().includes(q.toLowerCase()));
    return /*#__PURE__*/React.createElement("main", {
      style: {
        background: 'var(--parchment)'
      }
    }, /*#__PURE__*/React.createElement(SubNav, {
      title: "Accessories",
      links: [{
        id: 'all',
        label: 'All Accessories'
      }, {
        id: 'phone',
        label: 'Phone'
      }, {
        id: 'slate',
        label: 'Slate'
      }, {
        id: 'pulse',
        label: 'Pulse'
      }],
      active: "all",
      top: 44
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 'var(--container-grid)',
        margin: '0 auto',
        padding: '64px 24px 80px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 24,
        flexWrap: 'wrap',
        marginBottom: 'var(--space-xxl)'
      }
    }, /*#__PURE__*/React.createElement("h1", {
      style: {
        margin: 0,
        font: 'var(--type-hero)',
        letterSpacing: 'var(--track-hero)',
        maxWidth: 640,
        textWrap: 'balance'
      }
    }, "Accessories. ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--ink-48)'
      }
    }, "Essentials that pair perfectly.")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: 'flex-end'
      }
    }, /*#__PURE__*/React.createElement(SearchInput, {
      placeholder: "Search accessories",
      value: q,
      onChange: setQ,
      width: 360
    }), /*#__PURE__*/React.createElement(TextLink, {
      chevron: true,
      size: "caption",
      onClick: e => {
        e.preventDefault();
        go('buy');
      }
    }, "Shop Aero Pro"))), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 'var(--gutter-grid)'
      }
    }, items.map(a => /*#__PURE__*/React.createElement(UtilityCard, _extends({
      key: a.name
    }, a)))), items.length === 0 ? /*#__PURE__*/React.createElement("p", {
      style: {
        font: 'var(--type-body)',
        color: 'var(--ink-48)',
        textAlign: 'center',
        marginTop: 48
      }
    }, "No results for \u201C", q, "\u201D.") : null));
  }
  window.StoreScreen = StoreScreen;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/StoreScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/data.js
try { (() => {
window.TILE_DATA = {
  links: [{
    id: 'store',
    label: 'Store'
  }, {
    id: 'buy',
    label: 'Phone'
  }, {
    id: 'slate',
    label: 'Slate'
  }, {
    id: 'pulse',
    label: 'Pulse'
  }, {
    id: 'audio',
    label: 'Audio'
  }, {
    id: 'impact',
    label: 'Environment'
  }, {
    id: 'support',
    label: 'Support'
  }],
  accessories: [{
    name: 'Clear Case with Snap',
    price: '$49.00',
    eyebrow: 'New'
  }, {
    name: 'Woven Loop Band — 42mm',
    price: '$49.00'
  }, {
    name: '20W USB-C Power Adapter',
    price: '$19.00'
  }, {
    name: 'Echo Buds Pro',
    price: '$249.00',
    eyebrow: 'Free engraving'
  }, {
    name: 'Snap Wallet',
    price: '$59.00'
  }, {
    name: 'USB-C Woven Cable (1 m)',
    price: '$19.00'
  }, {
    name: 'Silicone Case — Sage',
    price: '$49.00'
  }, {
    name: 'Slate Keyboard Folio',
    price: '$249.00',
    eyebrow: 'New'
  }, {
    name: 'Travel Charging Dock',
    price: '$129.00'
  }, {
    name: 'Sport Band — Midnight',
    price: '$49.00'
  }],
  footer: {
    note: 'Trade-in values will vary based on the condition, year and configuration of your eligible trade-in device. Prices shown include estimated tax. Some features may not be available in all regions.',
    columns: [{
      heading: 'Shop and Learn',
      links: ['Store', 'Phone', 'Slate', 'Pulse', 'Audio', 'Accessories']
    }, {
      heading: 'Services',
      links: ['Cloud', 'Music', 'Arcade', 'Fitness']
    }, {
      heading: 'Store',
      links: ['Find a Store', 'Order Status', 'Financing', 'Trade In']
    }, {
      heading: 'About',
      links: ['Newsroom', 'Environment', 'Careers', 'Contact']
    }],
    copyright: 'Copyright © 2026 Tile Inc. All rights reserved.',
    legalLinks: ['Privacy Policy', 'Terms of Use', 'Sales and Refunds', 'Site Map'],
    region: 'United States'
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.TextLink = __ds_scope.TextLink;

__ds_ns.Footer = __ds_scope.Footer;

__ds_ns.OptionChip = __ds_scope.OptionChip;

__ds_ns.SearchInput = __ds_scope.SearchInput;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.GlobalNav = __ds_scope.GlobalNav;

__ds_ns.StickyBar = __ds_scope.StickyBar;

__ds_ns.SubNav = __ds_scope.SubNav;

__ds_ns.EditorialHero = __ds_scope.EditorialHero;

__ds_ns.ProductMedia = __ds_scope.ProductMedia;

__ds_ns.ProductTile = __ds_scope.ProductTile;

__ds_ns.UtilityCard = __ds_scope.UtilityCard;

})();
