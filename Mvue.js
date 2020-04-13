const CompileUtils = {
  getValue(value, data) {
    const values = value.split('.').reduce((init, current) => {
      return init[current];
    }, data);
    return values;
  },
  getContent(expr, data) {
    // {{person.name}}--{{person.age}}
    // 防止修改person.name使得所有值全部被替换
    return expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      return this.getValue(args[1], data);
    });
  },
  setVal(value, $data, inputValue) {
    var length = value.split('.').length;
    var index = 0;
    value.split('.').reduce((data, current) => {
      index++;
      if (index === length) {
        data[current] = inputValue;
      } else {
        return data[current];
      }
    }, $data);
  },
  text(node, value, data) {
    // let Realalue;
    let text;
    if (value.indexOf('{{') !== -1) {
      text = value.replace(/\{\{(.+?)\}\}/g, (...args) => {
        new Watcher(args[1], data, () => {
          // {{person.name}}--{{person.age}}
          // 防止修改person.name使得所有值全部被替换
          this.updater.textUpter(node, this.getContent(value, data));
        });
        return this.getValue(args[1], data);
      });
    } else {
      text = this.getValue(value, data);
      new Watcher(value, data, (newDada) => {
        this.updater.textUpter(node, newDada);
      });
    }
    this.updater.textUpter(node, text);
  },
  html(node, value, data) {
    const useValue = this.getValue(value, data);
    new Watcher(value, data, (newDada) => {
      this.updater.htmlUpter(node, newDada);
    });
    this.updater.htmlUpter(node, useValue);
  },
  bind(node, value, data, vm, eventName) {
    const useValue = this.getValue(value, data);
    this.updater.bindUpter(node, useValue, eventName);
  },
  model(node, value, data) {
    const useValue = this.getValue(value, data);
    new Watcher(value, data, (newDada) => {
      this.updater.modelUpter(node, newDada);
    });
    node.addEventListener('input', (e) => {
      this.setVal(value, data, e.target.value);
    });
    this.updater.modelUpter(node, useValue);
  },
  on(node, value, data, vm, eventName, $vm) {
    const fn = vm.methods && vm.methods[value];
    node.addEventListener(eventName, fn.bind($vm), false);
  },
  updater: {
    textUpter(node, value) {
      node.textContent = value;
    },
    htmlUpter(node, value) {
      node.innerHTML = value;
    },
    modelUpter(node, value) {
      node.value = value;
    },
    bindUpter(node, value, eventName) {
      node.setAttribute(eventName, value);
    },
  },
};
class Compiler {
  constructor(el, rootNode, data, options, vm) {
    this.$el = el;
    this.$rootNode = rootNode;
    this.$data = data;
    this.vm = options;
    this.$vm = vm; //vue构造函数里头的参数
    this.compiler(rootNode);
  }
  compiler(rootNode) {
    const fragment = this.node2Fragment(rootNode);
    this.compileNode(fragment);
    rootNode.appendChild(fragment);
  }
  node2Fragment(rootNode) {
    const f = document.createDocumentFragment();
    let firstChild;
    while ((firstChild = rootNode.firstChild)) {
      f.appendChild(firstChild);
    }
    return f;
  }
  compileNode(fragment) {
    const childNodes = fragment.childNodes;
    [...childNodes].forEach((child) => {
      if (child.nodeType === 1) {
        this.compileElement(child);
      } else {
        this.compileText(child);
      }
      if (child.childNodes && child.childNodes.length) {
        this.compileNode(child);
      }
    });
  }

  compileElement(node) {
    [...node.attributes].forEach((item) => {
      const { name, value } = item;
      if (this.isDetivite(name)) {
        const [, directive] = name.split('-');
        const [dirName, eventName] = directive.split(':');
        CompileUtils[dirName](node, value, this.$data, this.vm, eventName, this.$vm);
        node.removeAttribute('v-' + directive);
      } else {
        if (name.startsWith('@')) {
          const [, directive] = name.split('@');
          CompileUtils['on'](node, value, this.$data, this.vm, directive, this.$vm);
          node.removeAttribute('@' + directive);
        } else if (name.startsWith(':')) {
          const [, directive] = name.split(':');
          CompileUtils['bind'](node, value, this.$data, this.vm, directive);
          node.removeAttribute(':' + directive);
        }
      }
    });
  }
  compileText(child) {
    const text = child.textContent;
    if (/\{\{(.+?)\}\}/.test(text)) {
      CompileUtils['text'](child, text, this.$data);
    }
  }

  isDetivite(name) {
    return name.startsWith('v-');
  }
}
class Vue {
  constructor(options) {
    this.$el = options.el;
    this.$data = options.data;
    this.$options = options;
    const rootNode = this.getElement(this.$el);
    new Observer(this.$data);
    new Compiler(this.$el, rootNode, this.$data, this.$options, this);
    // 3. 通过数据代理实现 this.person.name，而不是this.$data.person.name
    this.proxyData(this.$data);
  }
  getElement(el) {
    return el.nodeType === 1 ? el : document.querySelector(el);
  }
  //用vm代理vm.$data
  proxyData(data) {
    for (let key in data) {
      Object.defineProperty(this, key, {
        get() {
          return data[key];
        },
        set(newVal) {
          data[key] = newVal;
        },
      });
    }
  }
}
class Observer {
  constructor(data) {
    this.$data = data;
    this.observe(this.$data);
  }
  observe(data) {
    if (data && typeof data === 'object') {
      Object.keys(data).forEach((key) => {
        this.defineProperty(data, key, data[key]);
      });
    }
  }
  defineProperty(data, key, value) {
    if (value && typeof value === 'object') {
      this.observe(value);
    }
    let dep = new Dep();
    Object.defineProperty(data, key, {
      enumerable: true,
      configurable: false,
      get() {
        Dep.target && dep.addSub(Dep.target);
        return value;
      },
      // 采用箭头函数在定义时绑定this的定义域
      set: (newVal) => {
        if (value === newVal) return;
        //对象里面的属性发生变化时对新的属性进行观察
        this.observe(newVal);
        // 给value也就是data[key]赋值新
        value = newVal;
        dep.notify();
      },
    });
  }
}
class Dep {
  // 收集器
  constructor() {
    this.subWatchers = [];
  }
  addSub(watcher) {
    this.subWatchers.push(watcher);
  }
  notify() {
    console.log('观察者', this.subWatchers);
    this.subWatchers.forEach((watcher) => {
      watcher.update();
    });
  }
}
class Watcher {
  constructor(value, data, cb) {
    this.$value = value;
    this.$data = data;
    this.$cb = cb;
    this.oldVal = this.getoldVal();
  }
  getoldVal() {
    Dep.target = this;
    const dada = CompileUtils.getValue(this.$value, this.$data);
    Dep.target = null;
    return dada;
  }
  update() {
    const newDada = CompileUtils.getValue(this.$value, this.$data);
    if (newDada !== this.oldVal) {
      this.$cb(newDada);
    }
  }
}
