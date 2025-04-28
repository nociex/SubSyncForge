/**
 * 图标生成器
 * 用于生成各种分类的base64编码图标
 */

// 内置的分类图标base64编码
const ICONS = {
  // 地区图标
  'HK': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAABbUlEQVR4nK2STUtCQRSGH9OyoqCwVYsSShIkIoiCtjWC+gsK2vQHWrQJWrSMcFW7/kGrWhVEq1Ba0T4IIoIgxD5BzW5xB86VFOvKhcOcmXnnee/MeQcKJBmYBZLAOfAKXGk9qdFFoKIQOAIsAbdAHsgAN8AWMAFUq98FTALrwLn6ZoELYBMYdcAZ/f4AMAtcA3mgDlgDjhVkHZj675QrJIHvgbfAG9AERAXNALYDngXa9Lxoz1iwKGA3UAfAogCpGn5f4iHQApS0j2gNaBGgW+ACIQk4D9Sqn9KZA+CjdOYAVPsANl8HpvRF4M5FHAduFNsHtI/Jf0IBIeAEuHIfWXjS2R5JQglQB9SoCRug0sVPyF1PgHGgWN51lTjsAzDr2jnl4q7JOXawIr/xfZ7ckuRHfxroiMJYAF7sbtN6GRhQJr3AFrClcWxZ+yGPZyUCzKklHy6fW2AHGAMqPMJ9ngnZe0L5jOrnuQE/fAJWJwrxAGDQmwAAAABJRU5ErkJggg==',
  'TW': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA0klEQVR4nGNgGFTAycHh/7K+vv/BbGcHBwaYOAM+sH///n9lLln/1+3e/X/dunVwNgMDA4OTg8N/JgYGBob1u3b9t7Cw+G9mZvY/MTHxf2Fh4f/s7Oz/KSkp/+Pi4v47ODj8X7t27X8GJgYGhv/79+//vmTJEhSNMJCTk/N/1apV3xkYGRkZJkyY8P/UqVP/L1++/P/ChQv/Dx06BNZsamo65UZ1ddZMTc3/0tLS/4ODg/97eXn9t7Oz+79lyxY4m4GBgWH//v3/8/PzPw66QAIAr7ZTDxF+qNkAAAAASUVORK5CYII=',
  'SG': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAABUUlEQVR4nGNgGDTAxcUlramp6SiYzcrKysBIjOL9+/cfbOno/A8CLi4uB2Fihnl5/xsaGv7X19f/X1VV9b+iouJ/aWnp/8LCwv85OTn/U1NT/8fHx/93cXHZv3///v+M+/fvf3f//v33d+7cgXPatGn/nZ2d/5uYmPzX0dH5r6Ki8l9aWvp/QkLC/3Pnzv2/cePG/2vXrv2/fv36+/v37//PcOHChf+XLl36f/r06f9Hjhz5f+LEif9Hjx79f/jw4f+7d+/+v2vXrvdlJiaztvb0ZG0dOTJr64QJWVsnTsz6v3dv1osXL7KeP3/++NGjR48ZLly48P/ixYv/T506hWJARkbGfy8vr/+2trb/LS0t/5uamv7X09P7r6am9l9RUXH/hQsXwGwGBgaG/fv3/09KSnrnHRr60cvbe7uXl9cWLy+vTV5eXhu9vLw2eHl5rR+oQAIAFl+iMXLHwnQAAAAASUVORK5CYII=',
  'US': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAABYUlEQVR4nGNgQANODg7/7yxb9j8hISFDW1v7tbaGxmVtbe0d2traK7W1tRdqa2tP0tbWbggJCfG3s7NjYHRxcfm/vmfZ/7qaOTCNJ3Zu+38aCZzav/1/akrSNCYXF5f/mxcu+l9bO+e/p6cnTOF/JLB2Tfv/6JiY/wwMDAxMBw4c+L9q1ar/aWlpYM3V1dX/XV1d/2/evPn/ly9f/n///v3/r1+//n/58uX/e0+e/D9z6NT/pqb5/2/fvv2f4ciRI//nzZv3PyIiAqz59OnT/12c7P9/+PDh/7t37/6/fPny/+PHj//fvXv3/3Pnzv0/fPjw/x07dvyvqKj5v2TJkv8MFy5c+H/s2LH/3t7ecAM+ffoEVvzx48f/b9++/f/kyZP/Dx069P/AgQP/9+3b93/Hjh3/N27c+L+iooorw/79+/+XlpZ+9vX1feTl5XXfy8vrope0zFknJ6cFnp6elV5eXq4DFUgAMbXYIihghScAAAAASUVORK5CYII=',
  'JP': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA40lEQVR4nGNgoBAw4pK0s7P7v2zZsv9xnp7/9+/fv9/FxeU/AwMDAxMuRfv37/9fMGPm/xhPz//btm37v27duvdOTk7/GRgYGBixKdq/f///ytbW/7Genr/R+CBgZ2f3n4GBgYERXXL//v3/+3Ly/sd7e38qKSv7D1MMYqO7AkUCZEBDR/v/GE/PTy0tPf9X3rn7/8KFC/+X37nzv2vFyv/2wUH/o6Ii/m/cuPF/dXX1f0ZkzWfOnPkf4+n5qXPW7P8Xzp//X9/R/r+wvvH/+zev/z9/8fL/unXr/jMQA+Sk0QE1AAAfQMjVQbw9MgAAAABJRU5ErkJggg==',
  'OTHER': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA7klEQVR4nO2QzwpBURTGf9c/GVgZmFApKwuPYCMPYGHjBaxsZOEZlJ2FspKNZ1DKzsZshvPdyiADXPOt7j33/r5zvu+cC3+UIz+/LPPtLqmtvaXdgaqTx7I7CGlhY2qQC9U58wDe1+I6nxYhYHQUcn1yYBoqYG4tLoUylfn2GrQCE7PTB6k1WNt3HgQj0zXb7w1g8CFLQNE0JoPJrMbepQ6BRKZGNl4G4GANvGVPQR3dg3PpCkFhFUPttkdY8i3jNPTkS0YOLPF+/4SQ77O6yE3Ir0G8FjKHQiYQsrMGrx1cKm2QXvIzyqPz8+/yCp2YPipb1wLSAAAAAElFTkSuQmCC',

  // 流媒体图标 - 使用简短的base64图标
  'OpenAI': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAyklEQVR4nGNgoBAwwhjs37//f3h4+H8QG5ccIy5NgYGB/0F0WFjYZgYGBob9+/fjNACmMSAgYIatra2qs7PzfwYGBoZly5bhdwaIBjGsra3/g9ggA0AMnAaAFIBokAEgA2AAZAhOL4A0hoaGgsVRDMDlBZgGmGaYZrjmuLi4/5GRkShsrC6AOQOmGa4ZyM7Pz/+fkZHxPzEx8X9UVNTnuLi4/+Hh4f9BbGdn5/4BiyQQgMUJiA0KqICAgNNOTk4bQGyY3EBE5sCXTQCZjnb7Fu+HhAAAAABJRU5ErkJggg==',
  'Disney+': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA8ElEQVR4nO3Tv0oDQRDH8Q/GIEQF/4AovoCFja1vYmdjIVj4DlaCjVhaiCAGOTAQCxFFEBILQbiQlEJII0SEwLKWY1i5jWKrfjsz+5v5zeyuUgENfHZwjD38pJRJVVDHKu6iURtDPKE7T6AfDVbwghdsd3CGQzziPZJtYBUL2AtfpdcLnGI91z/LiHcwSMIqPnLnT9jCWWR0iAoWsZniYDM3OAntWj6bLRxE8j6e8T3jUBEjdLGUuniD58zcQhqt0YjgIMa7aaKoYhBaP+HkH80TnUcpFHWvYymtREVF4j0s40bbubPCvv/gCtcFWv8CdmJox76H/MkAAAAASUVORK5CYII=',
  'Netflix': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA0klEQVR4nGNgoAR0lLZMLijJ24FFLkZjrQtDc4T6fwYGBgbG/fv3/w8JCfmPTbKpovl/c4T6/7yisv9tbW3/P3/+/L+xsfF/dXX1fyMjo/8ODg7/LS0t/2tpaf0vLi7+X1ZW9j0jI+M/EwMDA8O7d+/+Kyoq/u/s7Pz//v17sIa/f//+//v37/+fP3/+//37F8wHsUFiILn9+/f/Z0I3pbOzEyyJbAAuNl4XjBowarBGDIqX0DWAQFdX13+XgNr/IPDu3Tssg4sRlw19+/b5QFIyBQDl9JFjj/fvywAAAABJRU5ErkJggg==',
  'YouTube': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA3ElEQVR4nGNgoAQwwhjr1q37HxIS8j8gIGA/AwMDAwOSIkYGfGDdunX/bWxs/hsZGf23tbX9v27dOuwGrFu37r+Ly+T/6uoG/2fPXvR/3bp1/xkYGBgYV69e/d/Z2fl/ZGTU/9LSyv8rV678D5JbtWrVfwY0F4I0t7S0/G9sbPyfk5P339TU9D+IDwPr1q37n5CQ8N/KygrMB7HXr1//H2zAunXr/mto6/z/+v3n/+/fv/8PCgp6zzhu3Lr/iUkp/79+/fr/69ev/5OTk/8z4APr1q37Hxoa+h5fIAEAa2JxXtVUNtUAAAAASUVORK5CYII=',
  'Hulu': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAyklEQVR4nGNgGDRg3bp1/0NCQjYwMDAwMOISXLdu3X8HB4f/RkZG/0NDQ/8zMDAwMCJLrlmz5r+rq+t/Z2fn/7a2tv/Xrl37n4GBgYERWXLt2rX/3dzc/tvY2Pw3MDD4v379epguRmTJtWvX/vfw8PgvLy//X0JC4v/GjRuxGrBu3br/7h5e/7m4ef7LyMr+X79+/X9GZM1z5sz5r6ys/F9QUPi/hoYGVltXrFjx38XF5b+mpuZ/OTk5sCZjY+P/DAwMDAzoOg7q6PzPwMBAPgAAuV9ezvMiXswAAAAASUVORK5CYII=',
  'HBO': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA1ElEQVR4nGNgGBQgJCTkP5j1////uj/++KPHwMDAwEQJIQYGBoZ/V658kn327LkmAwMDA2NBQcF/Nnb2v+y8vD+5eHje5+TkzCwsLORiJKS5sLDwP5+g4H8JaenfUjIy/0A0iM/Jy/tRzM7O10RI87t37/6LSEr+E5eV/SclJ/cPRgvLyLwDi8+duxduwLt37/7n5+f/ZWJlfc/Kzv6alY3tIyszM0wMRczExOQkyYF44sSJSTDDGRgYGFiYmBhfsbCw/GFmZvnNxsb6HybGwMDAyMrKepA010MBAGHfdDJcqX+4AAAAAElFTkSuQmCC',
  'AmazonPrime': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA4UlEQVR4nGNgGNSgq6vrv5eX138GBgYGpu7u7v+enp7/PT09/3t4eIAl3dzcwLSnpydYAzLfzc3NF6zRw8PjP4jv7u4O5ru6ukI0dnV14TcApsnDwwNsAEgzumIPDw98LoFrgmkEmcjAwMCAz0uwQAMZAuLDAg/uJZDt69atg9gOcgVIckBcADIEpBnGB/FBLgHxYYFY0tXVBdakp6cH1wgKULhmFDGQASBDQAaANIP4IIUgPhwwMDAw+Pn5IUUmSAylDEAJRJghIDGQ5KgBIANAhiAbAvKKt7f3f19f3/8DFUgAz9qCIQ3kEJcAAAAASUVORK5CYII=',
  'BBC': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA2ElEQVR4nGNgGBQgJCTkfktLy/+WlpaHDAwMDIy4FIWGhv6vrKwEsyMiIv4zMDAw7N+/H68hMA0zZsyA82EGMTAwMDDOmTPnP8jZmpqa/3V0dP67uLj8ZWBgYDg5Y8Z/eVnZ/9JSkv+dnZ3/g/ggMQYGBgZGdBeCNIeHh/8PDQ0F8xkYGBjmzJnz/9ChQ/9nz54NlgdpBonBvQ0zBKaxsbHxf0NDA5wP0wgzDB5IMMWNjY3/6+rq/tfX1/9vaWmBizHiCxeQRHl5+X+QDTDNIFeysbH9Z2BgYBjQQAIAKUJtMJykQaUAAAAASUVORK5CYII=',
  'Emby': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA2klEQVR4nGNgGFQgJCTkfktLy/+WlpaHDAwMDIy4FIWGhv6vrKwEsyMiIv4zMDAw7N+/H68hMA0zZsyA82EGMTAwMDDOmTPnP8jZmpqa/3V0dP67uLj8ZWBgYDg5Y8Z/eVnZ/9JSkv+dnZ3/g/ggMQYGBgZGdBeCNIeHh/8PDQ0F8xkYGBjmzJnz/9ChQ/9nz54NlgdpBonBvQ0zBKaxsbHxf0NDA5wP0wgzDB5IMMWNjY3/6+rq/tfX1/9vaWmBizHiCxeQRHl5+X+QDTDNIFeysbH9Z2BgYBjQQAIAKUJtMJykQaUAAAAASUVORK5CYII=',
  'Spotify': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA1klEQVR4nGNgGBTAwcHhv7Oz83+o0H9CahgJaXZwcPgvJib2X0ZG5r+WltZ/BgYGBiZ8mu3t7f9zcHD85+fn/y8iIvJfXl7+PwMDAwMTPs329vb/WVlZ/wsMDEA1//+voqLyn4GBgYGJgYGBYf369f9FxcT+c3Bw/FfT1PwP0qiiogI3hJGBgYGhoqLiv6qa2l8uHp7//IKC/0VERf9LS0v/l5KS+s/IwMDAkJ+f/19UVPS/jIzMPwkJif8yMjLg5KSsrPyfkZOT8z8zM/N/JiYmOH9AAwkA53pwbRf4USEAAAAASUVORK5CYII=',
  'Bilibili': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAA5UlEQVR4nGNgGBTg////1gcPHvzPwMDAwMRAKrhy5er/U6dO/X/y5Ol/EJskA86fvwAW7Onp/g8yBKcBV65cAWvq7uoGa7px48Z/Dw+P/wwMDAxMDAQAOzs7WLCrqwus+ciRI2DJu3fvEjQAZABIsLOzE2zIvXv3wJpv3bpF2AtbtrRj1QgDt27dIhyIR4/uR9MQ/f/o0aP/Z82a9Z+BgYGBqbe3F66pr68PrOnixUtgzQcPHiRswJ49O7GGhft/kCEwjQwMDAxMIE1Xr159v3///tPs7OwPxMXFnzIwMDAwDJZAAgCnkHaDYzOu6AAAAABJRU5ErkJggg=='
};

/**
 * 图标生成器类，用于生成和管理分类图标
 */
export class IconGenerator {
  constructor() {
    this.icons = { ...ICONS };  // 创建ICONS的副本
  }

  /**
   * 获取指定分类的Base64图标
   * @param {string} category 分类名称
   * @returns {string} Base64编码的图标
   */
  getIcon(category) {
    // 标准化分类名称
    const normalizedCategory = this.normalizeCategory(category);
    
    // 返回对应的图标，如果没有则返回默认图标
    return this.icons[normalizedCategory] || this.icons['OTHER'];
  }

  /**
   * 根据规则标准化分类名称
   * @param {string} category 原始分类名称
   * @returns {string} 标准化后的分类名称
   */
  normalizeCategory(category) {
    if (!category) return 'OTHER';
    
    // 转换为大写以便匹配
    const upperCategory = String(category).toUpperCase();
    
    // 地区匹配
    if (upperCategory.includes('HONG KONG') || upperCategory === 'HK') return 'HK';
    if (upperCategory.includes('TAIWAN') || upperCategory === 'TW') return 'TW';
    if (upperCategory.includes('SINGAPORE') || upperCategory === 'SG') return 'SG';
    if (upperCategory.includes('UNITED STATES') || upperCategory === 'USA' || upperCategory === 'US') return 'US';
    if (upperCategory.includes('JAPAN') || upperCategory === 'JP') return 'JP';
    
    // 流媒体匹配
    if (upperCategory.includes('OPENAI') || upperCategory.includes('CHATGPT')) return 'OpenAI';
    if (upperCategory.includes('DISNEY')) return 'Disney+';
    if (upperCategory.includes('NETFLIX')) return 'Netflix';
    if (upperCategory.includes('YOUTUBE')) return 'YouTube';
    if (upperCategory.includes('HULU')) return 'Hulu';
    if (upperCategory.includes('HBO') || upperCategory === 'HBO') return 'HBO';
    if (upperCategory.includes('AMAZON') || upperCategory.includes('PRIME')) return 'AmazonPrime';
    if (upperCategory.includes('BBC')) return 'BBC';
    if (upperCategory.includes('EMBY')) return 'Emby';
    if (upperCategory.includes('SPOTIFY')) return 'Spotify';
    if (upperCategory.includes('BILIBILI')) return 'Bilibili';
    
    return 'OTHER';
  }

  /**
   * 获取所有可用的图标分类
   * @returns {Object} 所有可用的图标分类对象
   */
  getAllCategories() {
    return { ...this.icons };
  }

  /**
   * 添加自定义图标
   * @param {string} category 分类名称
   * @param {string} base64Data Base64编码的图标数据
   */
  addCustomIcon(category, base64Data) {
    if (category && base64Data) {
      this.icons[category] = base64Data;
    }
  }
}

// 创建一个单例实例并导出
const iconGenerator = new IconGenerator();
export default iconGenerator;