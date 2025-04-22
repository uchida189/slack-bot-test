require('dotenv').config();
const { App } = require('@slack/bolt');
const fs = require('fs');
const path = require('path');

// アプリ初期化
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true, // Socket Modeを有効に
  appToken: process.env.SLACK_APP_TOKEN, // App-Level Tokenが必要
});

// 設定ファイルのパス
const CONFIG_FILE_PATH = path.join(__dirname, 'config.json');

// 設定をメモリにキャッシュする
let configCache = null;
let lastConfigLoad = 0;
const CONFIG_CACHE_TTL = 60000; // 設定キャッシュの有効期間（ミリ秒）、1分

// 設定を取得する関数
function getConfig() {
  const now = Date.now();
  
  // キャッシュが有効な場合はキャッシュから返す
  if (configCache && (now - lastConfigLoad < CONFIG_CACHE_TTL)) {
    return configCache;
  }
  
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
      configCache = JSON.parse(configData);
    } else {
      // 初期設定
      const initialConfig = { 
        reactionRules: [],
        enabledChannels: [] 
      };
      saveConfig(initialConfig);
      configCache = initialConfig;
    }
    
    lastConfigLoad = now;
    return configCache;
  } catch (error) {
    console.error('設定ファイル読み込みエラー:', error);
    // エラーが発生した場合は新しい設定を返す
    return { reactionRules: [], enabledChannels: [] };
  }
}

// 設定を保存する関数
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf8');
    // キャッシュを更新
    configCache = config;
    lastConfigLoad = Date.now();
  } catch (error) {
    console.error('設定ファイル保存エラー:', error);
  }
}

// リアクションを追加する関数
async function addReaction(channel, timestamp, reaction) {
  try {
    // コロンを削除
    const cleanReaction = reaction.replace(/:/g, '');
    await app.client.reactions.add({
      channel: channel,
      timestamp: timestamp,
      name: cleanReaction
    });
    console.log(`リアクション ${reaction} を追加しました`);
  } catch (error) {
    console.error(`リアクション追加エラー: ${error}`);
  }
}

// ボットをチャンネルに参加させる関数
async function joinChannel(channelId) {
  try {
    await app.client.conversations.join({
      channel: channelId
    });
    console.log(`チャンネル ${channelId} に参加しました`);
    return true;
  } catch (error) {
    console.error(`チャンネル参加処理エラー: ${error}`);
    return false;
  }
}

// ボットをチャンネルから退出させる関数
async function leaveChannel(channelId) {
  try {
    await app.client.conversations.leave({
      channel: channelId
    });
    console.log(`チャンネル ${channelId} から退出しました`);
    return true;
  } catch (error) {
    console.error(`チャンネル退出処理エラー: ${error}`);
    return false;
  }
}

// メッセージを受信したときの処理
app.message(async ({ message, say }) => {
  // botのメッセージは無視
  if (message.subtype || message.bot_id) return;
  
  try {
    console.log("メッセージイベント処理開始:", message);
    
    const config = getConfig();
    
    // チャンネルが有効かチェック
    if (!config.enabledChannels.includes(message.channel)) {
      console.log(`チャンネル ${message.channel} は有効化されていません`);
      return;
    }
    
    // メッセージテキスト
    const messageText = message.text;
    console.log("メッセージテキスト:", messageText);
    
    // マッチするリアクションを集める
    const matchedReactions = [];
    
    for (const rule of config.reactionRules) {
      const keyword = rule.keyword.toLowerCase();
      
      // キーワードマッチング
      if (messageText.toLowerCase().includes(keyword)) {
        console.log(`キーワード「${keyword}」がマッチしました`);
        for (const reaction of rule.reactions) {
          if (!matchedReactions.includes(reaction)) {
            matchedReactions.push(reaction);
          }
        }
      }
    }
    
    console.log("追加するリアクション:", matchedReactions);
    
    // リアクションを追加
    for (const reaction of matchedReactions) {
      // 連続リクエストを避けるため少し間隔を空ける
      await new Promise(resolve => setTimeout(resolve, 200));
      await addReaction(message.channel, message.ts, reaction);
    }
  } catch (error) {
    console.error('メッセージ処理エラー:', error);
  }
});

// /reaction-add コマンド
app.command('/reaction-add', async ({ command, ack, respond }) => {
  await ack();
  
  const text = command.text;
  const params = text.split(' ');
  
  let responseText = '';
  
  try {
    const config = getConfig();
    
    if (params.length < 2) {
      responseText = 'キーワードとリアクションを指定してください。例: /reaction-add こんにちは :wave: :sunny:';
    } else {
      const keyword = params[0];
      const reactions = params.slice(1);
      
      // 既存のルールをチェック
      const existingRuleIndex = config.reactionRules.findIndex(
        rule => rule.keyword.toLowerCase() === keyword.toLowerCase()
      );
      
      if (existingRuleIndex !== -1) {
        // 既存のルールを更新
        config.reactionRules[existingRuleIndex].reactions = reactions;
        saveConfig(config);
        responseText = `キーワード「${keyword}」のリアクションルールを更新しました！`;
      } else {
        // 新しいルールを追加
        config.reactionRules.push({
          keyword: keyword,
          reactions: reactions
        });
        saveConfig(config);
        responseText = `新しいリアクションルールを追加しました！キーワード「${keyword}」には ${reactions.join(' ')} のリアクションが付きます。`;
      }
    }
  } catch (error) {
    console.error('コマンド処理エラー:', error);
    responseText = 'エラーが発生しました。';
  }
  
  await respond({
    text: responseText,
    response_type: 'ephemeral'
  });
});

// /reaction-remove コマンド
app.command('/reaction-remove', async ({ command, ack, respond }) => {
  await ack();
  
  const keyword = command.text.trim();
  let responseText = '';
  
  try {
    const config = getConfig();
    
    if (!keyword) {
      responseText = '削除するキーワードを指定してください。例: /reaction-remove こんにちは';
    } else {
      const initialRuleCount = config.reactionRules.length;
      config.reactionRules = config.reactionRules.filter(
        rule => rule.keyword.toLowerCase() !== keyword.toLowerCase()
      );
      
      if (config.reactionRules.length === initialRuleCount) {
        responseText = `キーワード「${keyword}」のルールは見つかりませんでした。`;
      } else {
        saveConfig(config);
        responseText = `キーワード「${keyword}」のリアクションルールを削除しました！`;
      }
    }
  } catch (error) {
    console.error('コマンド処理エラー:', error);
    responseText = 'エラーが発生しました。';
  }
  
  await respond({
    text: responseText,
    response_type: 'ephemeral'
  });
});

// /reaction-list コマンド
app.command('/reaction-list', async ({ command, ack, respond }) => {
  await ack();
  
  let responseText = '';
  
  try {
    const config = getConfig();
    
    if (config.reactionRules.length === 0) {
      responseText = 'リアクションルールはまだ設定されていません。';
    } else {
      responseText = '現在のリアクションルール一覧:\n';
      
      config.reactionRules.forEach((rule, index) => {
        responseText += `${index + 1}. キーワード「${rule.keyword}」 → ${rule.reactions.join(' ')}\n`;
      });
    }
  } catch (error) {
    console.error('コマンド処理エラー:', error);
    responseText = 'エラーが発生しました。';
  }
  
  await respond({
    text: responseText,
    response_type: 'ephemeral'
  });
});

// /reaction-enable コマンド
app.command('/reaction-enable', async ({ command, ack, respond }) => {
  await ack();
  
  const channelId = command.channel_id;
  let responseText = '';
  
  try {
    const config = getConfig();
    let channelJoinSuccess = true;
    
    // チャンネルに参加
    if (!config.enabledChannels.includes(channelId)) {
      // チャンネルに参加
      channelJoinSuccess = await joinChannel(channelId);
      
      if (channelJoinSuccess) {
        // 有効なチャンネルとして保存
        config.enabledChannels.push(channelId);
        saveConfig(config);
        responseText = 'このチャンネルでリアクション自動追加を有効にし、ボットをチャンネルに参加させました！';
      } else {
        responseText = 'このチャンネルでリアクション自動追加を有効にしようとしましたが、ボットをチャンネルに参加させられませんでした。ボットに適切な権限があるか確認してください。';
      }
    } else {
      // すでに有効だが、念のためチャンネルへの参加を試みる
      channelJoinSuccess = await joinChannel(channelId);
      responseText = 'このチャンネルはすでに有効になっています。';
    }
  } catch (error) {
    console.error('コマンド処理エラー:', error);
    responseText = 'エラーが発生しました。';
  }
  
  await respond({
    text: responseText,
    response_type: 'ephemeral'
  });
});

// /reaction-disable コマンド
app.command('/reaction-disable', async ({ command, ack, respond }) => {
  await ack();
  
  const channelId = command.channel_id;
  let responseText = '';
  
  try {
    const config = getConfig();
    
    if (config.enabledChannels.includes(channelId)) {
      // 有効なチャンネルから削除
      config.enabledChannels = config.enabledChannels.filter(id => id !== channelId);
      saveConfig(config);
      
      // チャンネルから退出
      const channelLeaveSuccess = await leaveChannel(channelId);
      
      if (channelLeaveSuccess) {
        responseText = 'このチャンネルでリアクション自動追加を無効にし、ボットをチャンネルから退出させました！';
      } else {
        responseText = 'このチャンネルでリアクション自動追加を無効にしましたが、ボットをチャンネルから退出させられませんでした。';
      }
    } else {
      responseText = 'このチャンネルはすでに無効になっています。';
    }
  } catch (error) {
    console.error('コマンド処理エラー:', error);
    responseText = 'エラーが発生しました。';
  }
  
  await respond({
    text: responseText,
    response_type: 'ephemeral'
  });
});

// アプリ起動
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Bolt アプリが起動しました!');
})();