// 演示模式内置内容:未配置 API key 时也能完整体验所有 9 种玩法
export const FALLBACK_SPECS = {
  quiz: {
    title: '天南地北知识大挑战',
    spec: {
      questions: [
        { q: '世界上面积最大的国家是?', options: ['中国', '俄罗斯', '加拿大', '美国'], answer: 1 },
        { q: '一天有多少秒?', options: ['86400', '3600', '43200', '604800'], answer: 0, explain: '24×60×60' },
        { q: '「床前明月光」的作者是?', options: ['杜甫', '白居易', '李白', '王维'], answer: 2 },
        { q: '彩虹有几种颜色?', options: ['5', '6', '7', '8'], answer: 2 },
        { q: '企鹅主要生活在?', options: ['北极', '南极', '两极都有', '温带海岛'], answer: 1, explain: '野生企鹅几乎都在南半球' },
        { q: '人体最大的器官是?', options: ['肝脏', '大脑', '皮肤', '肺'], answer: 2 },
      ],
    },
  },
  undercover: {
    title: '谁是卧底 · 经典局',
    spec: {
      wordPairs: [
        { civilian: '牛奶', undercover: '豆浆' },
        { civilian: '口红', undercover: '唇釉' },
        { civilian: '火锅', undercover: '麻辣烫' },
        { civilian: '钢琴', undercover: '电子琴' },
        { civilian: '沙滩', undercover: '泳池' },
      ],
    },
  },
  draw: {
    title: '你画我猜 · 欢乐场',
    spec: { words: ['长颈鹿', '奶茶', '滑板', '生日蛋糕', '外星人', '眼镜', '热气球', '仙人掌', '灯塔', '西瓜', '机器人', '雨伞'], rounds: 4 },
  },
  bomb: { title: '数字炸弹 · 谁踩谁尬', spec: { rounds: 3, penalty: '用最夸张的语气念一句土味情话' } },
  vote: {
    title: '大家来吐槽',
    spec: {
      prompts: [
        '谁最可能半夜三点还在刷手机?',
        '谁最可能成为百万富翁?',
        '谁最可能迷路一小时还嘴硬?',
        '谁的笑声最有感染力?',
        '谁最可能当场社死还面不改色?',
        '谁最适合当导游?',
      ],
    },
  },
  react: { title: '手速大对决', spec: { rounds: 10 } },
  chain: { title: '成语接龙大赛', spec: { category: '成语', title: '成语接龙大赛', rule: '接上一个成语的最后一个字,20秒内接不上出局!', startWord: '一马当先', strict: true } },
  emoji: {
    title: '表情包猜猜猜',
    spec: {
      theme: '看 emoji 猜成语/事物',
      items: [
        { emoji: '🐴🐴🐯🐯', answer: '马马虎虎' },
        { emoji: '💧📉🪨🌊', answer: '水落石出' },
        { emoji: '🐔🦢🛫', answer: '鸡飞蛋打', hint: '四个字,和鸡有关' },
        { emoji: '🌸🍃🌊', answer: '花红柳绿', hint: '形容春天' },
        { emoji: '7️⃣⬆️8️⃣⬇️', answer: '七上八下' },
        { emoji: '🐟🍚🥩', answer: '鱼香肉丝', hint: '一道菜' },
      ],
    },
  },
  wheel: {
    title: '真心话大转盘',
    spec: {
      rounds: 6,
      questions: [
        '说一件你最近做过最勇敢的事',
        '模仿房间里任意一个人说话',
        '唱一句你最近单曲循环的歌',
        '说出你手机里最舍不得删的一张照片的故事',
        '用三个词形容左边麦位的人',
        '分享一个你从没告诉过别人的小癖好',
      ],
    },
  },
  tetris: { title: '方块大乱斗', spec: { title: '方块大乱斗', duration: 120 } },
  suika: {
    title: '合成大西瓜',
    spec: { title: '合成大西瓜', duration: 120, chain: ['🍒', '🍓', '🍇', '🍊', '🍎', '🍐', '🍑', '🍍', '🍈', '🍉'] },
  },
  shooter: {
    title: '萌宠大乱斗',
    spec: {
      title: '萌宠大乱斗', duration: 120,
      theme: { playerEmoji: ['🐱', '🐶', '🦊', '🐸', '🐼', '🐯', '🐰', '🦁'], arenaColor: '#16213e' },
    },
  },
  fight: {
    title: '巅峰擂台赛',
    spec: {
      title: '巅峰擂台赛', rounds: 6, roundSec: 60,
      theme: {
        fighters: [
          { emoji: '🐲', name: '青龙' }, { emoji: '🐯', name: '白虎' },
          { emoji: '🦅', name: '朱雀' }, { emoji: '🐢', name: '玄武' },
          { emoji: '🦁', name: '狮王' }, { emoji: '🐺', name: '孤狼' },
          { emoji: '🐻', name: '铁熊' }, { emoji: '🦍', name: '金刚' },
        ],
        moves: { punch: '崩拳', kick: '扫堂腿', block: '铁布衫' },
      },
    },
  },
};
