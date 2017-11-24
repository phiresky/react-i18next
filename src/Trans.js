import React from 'react';
import PropTypes from 'prop-types';
import HTML from 'html-parse-stringify2';

function hasChildren(node) {
  return node && (node.children || (node.props && node.props.children));
}

function getChildren(node) {
  return node && node.children ? node.children : node.props && node.props.children;
}

function nodesToString(mem, children, index) {
  if (Object.prototype.toString.call(children) !== '[object Array]') children = [children];

  children.forEach((child, i) => {
    // const isElement = React.isValidElement(child);
    // const elementKey = `${index !== 0 ? index + '-' : ''}${i}:${typeof child.type === 'function' ? child.type.name : child.type || 'var'}`;
    const elementKey = `${i}`;

    if (typeof child === 'string') {
      mem = `${mem}${child}`;
    } else if (hasChildren(child)) {
      mem = `${mem}<${elementKey}>${nodesToString('', getChildren(child), i + 1)}</${elementKey}>`;
    } else if (React.isValidElement(child)) {
      mem = `${mem}<${elementKey}></${elementKey}>`;
    } else if (typeof child === 'object') {
      const clone = { ...child };
      const format = clone.format;
      delete clone.format;

      const keys = Object.keys(clone);
      if (format && keys.length === 1) {
        mem = `${mem}{{${keys[0]}, ${format}}}`;
      } else if (keys.length === 1) {
        mem = `${mem}{{${keys[0]}}}`;
      } else if (console && console.warn) {
        // not a valid interpolation object (can only contain one value plus format)
        console.warn(`react-i18next: the passed in object contained more than one variable - the object should look like {{ value, format }} where format is optional.`, child)
      }
    } else if (console && console.warn) {
      console.warn(`react-i18next: the passed in value is invalid - seems you passed in a variable like {number} - please pass in variables for interpolation as full objects like {{number}}.`, child)
    }
  });

  return mem;
}

function renderNodes(children, targetString, i18n) {

  const data = {};
  function getData(children) {
    if (Object.prototype.toString.call(children) !== '[object Array]') children = [children];
    for (const child of children) {
      if (typeof child === 'string') continue;
      if (hasChildren(child)) getData(getChildren(child));
      else if (typeof child === 'object' && !React.isValidElement(child)) Object.assign(data, child);
    }
  }
  getData(children);
  targetString = i18n.services.interpolator.interpolate(targetString, data, i18n.language);

  // parse ast from string with additional wrapper tag
  // -> avoids issues in parser removing prepending text nodes
  const ast = HTML.parse(`<0>${targetString}</0>`);

  function mapAST(reactNodes, astNodes) {
    if (Object.prototype.toString.call(reactNodes) !== '[object Array]') reactNodes = [reactNodes];
    if (Object.prototype.toString.call(astNodes) !== '[object Array]') astNodes = [astNodes];

    return astNodes.reduce((mem, node, i) => {
      if (node.type === 'tag') {
        const child = reactNodes[parseInt(node.name, 10)] || {};
        const isElement = React.isValidElement(child);

        if (typeof child === 'string') {
          mem.push(child);
        } else if (hasChildren(child)) {
          const inner = mapAST(getChildren(child), node.children);
          if (child.dummy) child.children = inner; // needed on preact!
          mem.push(React.cloneElement(
            child,
            { ...child.props, key: i },
            inner
          ));
        } else {
          mem.push(child);
        }
      } else if (node.type === 'text') {
        mem.push(node.content);
      }
      return mem;
    }, []);
  }

  // call mapAST with having react nodes nested into additional node like
  // we did for the string ast from translation
  // return the children of that extra node to get expected result
  const result = mapAST([{ dummy: true, children }], ast);
  return getChildren(result[0]);
}


export default class Trans extends React.Component {

  render() {
    const contextAndProps = { i18n: this.context.i18n, t: this.context.t, ...this.props };
    const { children, count, parent, i18nKey, i18n, t, ...additionalProps } = contextAndProps;

    const useAsParent = parent !== undefined ? parent : i18n.options.react.defaultTransParent;

    const defaultValue = nodesToString('', children, 0);
    const hashTransKey = i18n.options.react && i18n.options.react.hashTransKey;
    const key = i18nKey || (hashTransKey ? hashTransKey(defaultValue) : defaultValue);
    const translation = key ? t(key, { interpolation: { prefix: '#$?', suffix: '?$#' }, defaultValue, count }) : defaultValue;

    if (i18n.options.react && i18n.options.react.exposeNamespace) {
      let ns = typeof t.ns === 'string' ? t.ns : t.ns[0];
      if (i18nKey && i18n.options.nsSeparator && i18nKey.indexOf(i18n.options.nsSeparator) > -1) {
        const parts = i18nKey.split(i18n.options.nsSeparator);
        ns = parts[0];
      }
      if (t.ns) additionalProps['data-i18next-options'] = JSON.stringify({ ns });
    }

    if (!useAsParent) return children;

    return React.createElement(
      useAsParent,
      additionalProps,
      renderNodes(children, translation, i18n)
    );
  }
}

Trans.propTypes = {
  count: PropTypes.number,
  parent: PropTypes.node,
  i18nKey: PropTypes.string,
  i18n: PropTypes.object,
  t: PropTypes.func
};

// Trans.defaultProps = {
//   parent: 'div'
// };

Trans.contextTypes = {
  i18n: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired
};
