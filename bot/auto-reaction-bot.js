// Slack Auto Reaction Bot - Google Apps Script版

// プロパティストアから設定を取得する関数
function getConfig() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const configJson = scriptProperties.getProperty('CONFIG');
  
  if (!configJson) {
    // 初期設定
    const initialConfig = { 
      reactionRules: [],
      enabledChannels: [] 
    };
    scriptProperties.setProperty('CONFIG', JSON.stringify(initialConfig));
    return initialConfig;
  } else {
    return JSON.parse(configJson);
  }
}

// 設定を保存する関数
function saveConfig(config) {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperty('CONFIG', JSON.stringify(config));
}

// Slack APIを使ってリアクションを追加する関数
function addReaction(channel, timestamp, reaction) {
  const slackToken = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
  
  const options = {
    'method': 'post',
    'contentType': 'application/x-www-form-urlencoded',
    'payload': {
      'token': slackToken,
      'channel': channel,
      'timestamp': timestamp,
      'name': reaction.replace(/:/g, '') // コロンを削除
    }
  };
  
  UrlFetchApp.fetch('https://slack.com/api/reactions.add', options);
}

// ボットをチャンネルに参加させる関数
function joinChannel(channelId) {
  try {
    const slackToken = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
    
    const options = {
      'method': 'post',
      'contentType': 'application/x-www-form-urlencoded',
      'payload': {
        'token': slackToken,
        'channel': channelId
      }
    };
    
    const response = UrlFetchApp.fetch('https://slack.com/api/conversations.join', options);
    const responseData = JSON.parse(response.getContentText());
    
    if (!responseData.ok) {
      console.error(`チャンネル参加エラー: ${responseData.error}`);
      return false;
    }
    
    console.log(`チャンネル ${channelId} に参加しました`);
    return true;
  } catch (error) {
    console.error(`チャンネル参加処理エラー: ${error}`);
    return false;
  }
}

// ボットをチャンネルから退出させる関数
function leaveChannel(channelId) {
  try {
    const slackToken = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
    
    const options = {
      'method': 'post',
      'contentType': 'application/x-www-form-urlencoded',
      'payload': {
        'token': slackToken,
        'channel': channelId
      }
    };
    
    const response = UrlFetchApp.fetch('https://slack.com/api/conversations.leave', options);
    const responseData = JSON.parse(response.getContentText());
    
    if (!responseData.ok) {
      console.error(`チャンネル退出エラー: ${responseData.error}`);
      return false;
    }
    
    console.log(`チャンネル ${channelId} から退出しました`);
    return true;
  } catch (error) {
    console.error(`チャンネル退出処理エラー: ${error}`);
    return false;
  }
}

// Slackからのリクエストを処理する関数
function doPost(e) {
  try {
    // デバッグログ
    console.log("リクエスト受信: " + JSON.stringify(e));
    
    // リクエストタイプの判別
    if (e.postData && e.postData.type === "application/json") {
      // イベントAPI（JSON形式）からのリクエスト処理
      const data = JSON.parse(e.postData.contents);
      console.log("JSONデータ受信: " + JSON.stringify(data));
      
      // Slackからのチャレンジリクエストに応答
      if (data.type === 'url_verification') {
        return ContentService.createTextOutput(data.challenge);
      }
      
      // イベントを処理
      if (data.event) {
        console.log("イベント検出: " + JSON.stringify(data.event));
        
        // メッセージイベントを処理
        if (data.event.type === 'message' && !data.event.subtype && !data.event.bot_id) {
          // botのメッセージには反応しない
          processMessageEvent(data.event);
        }
      }
    } 
    else if (e.parameter && e.parameter.command) {
      // スラッシュコマンド（form-urlencoded形式）からのリクエスト処理
      console.log("スラッシュコマンド受信: " + e.parameter.command);
      return processSlashCommand(e.parameter);
    }
  } catch (error) {
    console.error("doPost処理エラー: " + error);
  }
  
  return ContentService.createTextOutput('');
}

// メッセージイベントを処理する関数
function processMessageEvent(event) {
  try {
    console.log("メッセージイベント処理開始: " + JSON.stringify(event));
    
    const config = getConfig();
    console.log("設定取得: " + JSON.stringify(config));
    
    // チャンネルが有効かチェック
    if (!config.enabledChannels.includes(event.channel)) {
      console.log(`チャンネル ${event.channel} は有効化されていません`);
      return;
    }
    
    // メッセージテキスト
    const messageText = event.text;
    console.log("メッセージテキスト: " + messageText);
    
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
    
    console.log("追加するリアクション: " + JSON.stringify(matchedReactions));
    
    // リアクションを追加
    for (const reaction of matchedReactions) {
      // 連続リクエストを避けるため少し間隔を空ける
      Utilities.sleep(200);
      addReaction(event.channel, event.ts, reaction);
      console.log(`リアクション ${reaction} を追加しました`);
    }
  } catch (error) {
    console.error('メッセージ処理エラー: ' + error);
  }
}

// スラッシュコマンドを処理する関数
function processSlashCommand(data) {
  const command = data.command;
  const responseUrl = data.response_url;
  const channelId = data.channel_id;
  const text = data.text;
  
  let responseText = '';
  
  try {
    const config = getConfig();
    
    // コマンドごとの処理
    if (command === '/reaction-add') {
      const params = text.split(' ');
      
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
    } 
    else if (command === '/reaction-remove') {
      const keyword = text.trim();
      
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
    }
    else if (command === '/reaction-list') {
      if (config.reactionRules.length === 0) {
        responseText = 'リアクションルールはまだ設定されていません。';
      } else {
        responseText = '現在のリアクションルール一覧:\n';
        
        config.reactionRules.forEach((rule, index) => {
          responseText += `${index + 1}. キーワード「${rule.keyword}」 → ${rule.reactions.join(' ')}\n`;
        });
      }
    }
    else if (command === '/reaction-enable') {
      let channelJoinSuccess = true;
      
      // チャンネルに参加
      if (!config.enabledChannels.includes(channelId)) {
        // チャンネルに参加
        channelJoinSuccess = joinChannel(channelId);
        
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
        channelJoinSuccess = joinChannel(channelId);
        responseText = 'このチャンネルはすでに有効になっています。';
      }
    }
    else if (command === '/reaction-disable') {
      if (config.enabledChannels.includes(channelId)) {
        // 有効なチャンネルから削除
        config.enabledChannels = config.enabledChannels.filter(id => id !== channelId);
        saveConfig(config);
        
        // チャンネルから退出
        const channelLeaveSuccess = leaveChannel(channelId);
        
        if (channelLeaveSuccess) {
          responseText = 'このチャンネルでリアクション自動追加を無効にし、ボットをチャンネルから退出させました！';
        } else {
          responseText = 'このチャンネルでリアクション自動追加を無効にしましたが、ボットをチャンネルから退出させられませんでした。';
        }
      } else {
        responseText = 'このチャンネルはすでに無効になっています。';
      }
    }
    
    // Slackにレスポンスを送信
    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify({
        'text': responseText,
        'response_type': 'ephemeral'
      })
    };
    
    UrlFetchApp.fetch(responseUrl, options);
    
  } catch (error) {
    console.error('コマンド処理エラー: ' + error);
    
    // エラーレスポンスを送信
    const options = {
      'method': 'post',
      'contentType': 'application/json',
      'payload': JSON.stringify({
        'text': 'エラーが発生しました。',
        'response_type': 'ephemeral'
      })
    };
    
    UrlFetchApp.fetch(responseUrl, options);
  }
  
  return ContentService.createTextOutput('');
}