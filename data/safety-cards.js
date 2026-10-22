// The GPT100 emergency card for international runners, in the runner app (Help tab).
// Text from GPT100_InternationalRunners_EmergencyCard_2026_v0_5 (English master) and the Japanese, Simplified Chinese,
// Russian and Polish cards of the same version (Drive: GPT100 / International Runners Emergency). The printed cards are
// handed out at registration; this is the same text on the phone. Keep the wording in step with the documents:
// corrections from the interpreter checks go into the documents first, then here.
// Status at 21 October 2026: v0.5, Chinese checked by Joe Zhang, Japanese check with Mirai pending, Russian and Polish
// unchecked; Colin's call of 21 October was to proceed to print with all of them.
// Markup in the text: **bold**. 000, 112 and the Medical Team number become tap-to-call links.
// Block types: p (paragraph), steps (numbered), bullets, check (tick boxes, kept on the phone), table (label and value),
// alert (a boxed warning with a title, paragraphs, numbered steps and a closing note).
window.GPT_SAFETY_CARDS = {
  version: '0.5',
  note: 'GPT100 Emergency Card v0.5, October 2026. The same card is printed on waterproof paper and handed out at registration.',
  langs: [
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語 (Japanese)' },
    { code: 'zh', label: '简体中文 (Simplified Chinese)' },
    { code: 'ru', label: 'Русский (Russian)' },
    { code: 'pl', label: 'Polski (Polish)' }
  ],
  cards: {
    en: {
      lang: 'en',
      intro: `Read this before you start. Keep it in your pack.`,
      summaryTitle: `In an emergency`,
      summary: [
        ['STOP', '', `Make sure you are safe. If bitten, keep still.`],
        ['CALL', '', `000 first, then the Medical Team on 1300 375 352.`],
        ['TELL', '', `Your three words from Emergency+, your bib number, what happened.`],
        ['STAY', '', `Stay with an injured runner. Wait for help to come to you.`]
      ],
      sections: [
        { n: '01', title: `Emergency numbers`, blocks: [
          { type: 'alert', title: `LIFE-THREATENING EMERGENCY: CALL 000 FIRST`, text: [
            `Call 000 (Triple Zero) for an ambulance, police or fire. 112 also works from a mobile. The call is free and works on any network that has signal.`,
            `Life-threatening means: not breathing, unconscious, heavy bleeding, chest pain, snake bite, or very cold or very hot and confused.`,
            `Not confident in English? Still call 000. Say “Ambulance”, then “Victoria”, then the name of your language in English. Stay on the line. An interpreter will join. This can take a minute.`
          ] },
          { type: 'p', text: `Then call the Medical Team. Call your Race Manager for anything else. Save both numbers in your phone before you start. The Medical Team speaks English. If you cannot explain, call 000 and ask for an interpreter.` },
          { type: 'table', rows: [[`Medical Team`, `1300 375 352`], [`Your Race Manager`, `Number on the back of your bib`]] }
        ] },
        { n: '02', title: `Tell us where you are`, blocks: [
          { type: 'steps', items: [
            `Open the Emergency+ app.`,
            `Read out the three words (what3words) exactly as they appear, in English. If they are not in English, or English is hard, read out the GPS numbers instead. You can say the numbers in your own language once the 000 interpreter is on the line.`,
            `Give your bib number, the last aid station you passed, and what happened.`
          ] },
          { type: 'p', text: `With a Telstra SIM, calling 000 usually also sends your phone's location. Always say where you are.` },
          { type: 'p', text: `**No phone signal?** If you are not hurt, walk on to the next aid station or a place with signal and call from there. If you are hurt, stay where you are and stop the next runner. Let them photograph your bib and your Emergency+ screen. They take it to the next aid station.` }
        ] },
        { n: '03', title: `Lost or stopping`, blocks: [
          { type: 'p', text: `**Lost?** Stop. Go back to the last marker you saw and check your offline map in the TERRAiNAV app. Follow the orange reflective markers and the yellow Grampians Peaks Trail triangles. A red cross means wrong way.` },
          { type: 'p', text: `**Stopping the race?** Tell the aid station crew your bib number. If you leave the course anywhere else, you must phone your Race Manager. If you do not tell us, we start a search for you.` }
        ] },
        { n: '04', title: `Before you start`, blocks: [
          { type: 'check', items: [
            `Phone fully charged, with a Telstra SIM. Carry a power bank.`,
            `Emergency+ and VicEmergency apps installed.`,
            `Offline course map downloaded in the TERRAiNAV app.`,
            `Event numbers saved in your phone.`,
            `Google Translate installed, with your language downloaded for offline use.`,
            `Snake bandage in a pocket you can reach quickly.`,
            `Emergency contact and medical details correct in your registration.`
          ] }
        ] },
        { n: '05', title: `Show this card`, blocks: [
          { type: 'p', text: `Our crew and Medical Team use translation apps. If you cannot explain, show them this card and point.` }
        ] },
        { n: '06', title: `Weather and fire`, blocks: [
          { type: 'p', text: `**Cold.** The ridges can drop below 0°C at night with strong wind. Put on your warm layers early, before you feel cold. Warning signs: strong shivering, slurred speech, confusion, stumbling. Get out of the wind, put on every layer and your emergency blanket, and call for help.` },
          { type: 'p', text: `**Heat.** Slow down when it is hot. Drink electrolyte, not only plain water, and drink to thirst. Use ice and water on your head and neck at aid stations. Warning signs: headache, dizziness, vomiting, confusion. Stop in shade, cool down and call for help.` },
          { type: 'p', text: `**Fire.** If you see fire or smoke, call 000. Move away from it, toward the nearest aid station or road, and follow instructions from event crew. The VicEmergency app shows fire warnings.` }
        ] },
        { n: '07', title: `Snake bite`, blocks: [
          { type: 'alert', title: `DO NOT MOVE. KEEPING STILL SLOWS THE VENOM SPREADING.`, steps: [
            `Move a few steps away from the snake. Do not try to catch it or identify it.`,
            `Sit or lie down. Stay still and calm.`,
            `Call 000, then the Medical Team. Give your three words.`,
            `Put a firm bandage over the bite.`,
            `Then wrap a second bandage from just above the fingers or toes up the whole leg or arm, as far as it reaches. Firm and tight, like for a sprained ankle. If the bandage has rectangles, stretch it until they become squares. Only one bandage? Ask another runner for theirs.`,
            `Keep the limb straight and still. Splint it with a pole or stick, covering the joints above and below the bite. Leave the bandages and splint on until medical staff remove them.`,
            `Do not wash the bite. Do not cut it. Do not use a tourniquet.`,
            `Wait for help to come to you. Do not walk out.`
          ], after: [`A bite can feel like a scratch from a stick. Look for two small marks, often on the lower leg. If you are not sure, treat it as a bite.`] },
          { type: 'p', text: `**If you see a snake:** stop, step back slowly and give it space. It wants to leave. Wait until it moves off the trail.` }
        ] },
        { n: '08', title: `If another runner needs help`, blocks: [
          { type: 'bullets', items: [
            `Stop. Make sure you are safe first.`,
            `Call 000 if it is life-threatening, then the Medical Team.`,
            `Stay with them. Keep them warm, or shade them from the sun if it is hot. Put their emergency blanket around them.`,
            `If you go for help, make sure another runner stays with them. Photograph the injured runner's bib and Emergency+ screen, and tell the next aid station.`,
            `Snake bite: help them bandage as in section 07. If they need a second bandage, use yours.`,
            `Do not move them unless they are in danger where they are.`
          ] }
        ] }
      ]
    },
    ja: {
      lang: 'ja',
      intro: `スタート前に読み、このカードをザックに入れて携帯してください。`,
      summaryTitle: `緊急時は`,
      summary: [
        ['止まる', 'STOP', `自分の安全を確認。咬まれたら動かない。`],
        ['電話する', 'CALL', `まず000、次にメディカルチーム 1300 375 352。`],
        ['伝える', 'TELL', `Emergency+の3つの単語、ゼッケン番号、何が起きたか。`],
        ['待つ', 'STAY', `けが人のそばにいる。助けが来るのを待つ。`]
      ],
      sections: [
        { n: '01', title: `緊急連絡先`, blocks: [
          { type: 'alert', title: `命に関わる緊急事態：まず000に電話`, text: [
            `救急車・警察・消防は000（Triple Zero）に電話してください。携帯電話からは112でもつながります。通話は無料で、電波があればどの通信会社でもつながります。`,
            `命に関わる状態とは：呼吸をしていない、意識がない、大量の出血、胸の痛み、ヘビに咬まれた、体がひどく冷えたり熱くなったりして混乱している、などです。`,
            `英語に自信がなくても、000に電話してください。まず「Ambulance」、次に「Victoria」、そして英語で自分の言語名（「Japanese」）を言ってください。電話を切らずに待ってください。通訳がつながります。少し時間がかかることがあります。`
          ] },
          { type: 'p', text: `次にメディカルチームに電話してください。それ以外のことはレースマネージャーに電話してください。スタート前に両方の番号を携帯電話に登録しておいてください。メディカルチームは英語で対応します。説明できない場合は000に電話し、通訳を頼んでください。` },
          { type: 'table', rows: [[`メディカルチーム`, `1300 375 352`], [`あなたのレースマネージャー`, `ゼッケンの裏に記載された番号`]] }
        ] },
        { n: '02', title: `現在地を伝える`, blocks: [
          { type: 'steps', items: [
            `Emergency+アプリを開きます。`,
            `画面の3つの単語（what3words）を、表示どおり英語で読み上げてください。単語が英語で表示されない場合や英語が難しい場合はGPSの数字を読み上げ、000の通訳につながったら数字を日本語で言ってかまいません。`,
            `ゼッケン番号、最後に通過したエイドステーション、何が起きたかを伝えてください。`
          ] },
          { type: 'p', text: `TelstraのSIMで000に電話すると、通常は現在地も自動で送られます。必ず場所も伝えてください。` },
          { type: 'p', text: `**電波がない場合：** けががなければ、次のエイドステーションか電波の届く場所まで進んで電話してください。けがをしている場合はその場を動かず、次に来たランナーを呼び止めてください。あなたのゼッケンとEmergency+の画面を写真に撮ってもらい、次のエイドステーションに届けてもらいます。` }
        ] },
        { n: '03', title: `道に迷ったとき・レースをやめるとき`, blocks: [
          { type: 'p', text: `**道に迷ったら：** 止まってください。最後に見たマーカーまで戻り、TERRAiNAVアプリのオフラインマップを確認してください。オレンジ色の反射マーカーと、黄色い三角形のGrampians Peaks Trail標識をたどってください。赤い×印は間違った方向という意味です。` },
          { type: 'p', text: `**レースをやめるとき：** エイドステーションのスタッフにゼッケン番号を伝えてください。それ以外の場所でコースを離れる場合は、必ずレースマネージャーに電話してください。連絡がないと、私たちは捜索を開始します。` }
        ] },
        { n: '04', title: `スタート前の確認`, blocks: [
          { type: 'check', items: [
            `携帯電話をフル充電し、TelstraのSIMを入れる。モバイルバッテリーを持つ。`,
            `Emergency+とVicEmergencyのアプリをインストール。`,
            `TERRAiNAVアプリでコースのオフラインマップをダウンロード。`,
            `大会の連絡先番号を携帯電話に登録。`,
            `Google Translate（Google翻訳）をインストールし、日本語をオフライン用にダウンロード。`,
            `スネークバンデージを、すぐ取り出せるポケットに入れる。`,
            `エントリー時に登録した緊急連絡先と医療情報が正しいか確認。`
          ] }
        ] },
        { n: '05', title: `このカードを見せる`, blocks: [
          { type: 'p', text: `スタッフとメディカルチームは翻訳アプリを使います。説明できないときは、このカードを見せて指さしてください。` }
        ] },
        { n: '06', title: `天候と火災`, blocks: [
          { type: 'p', text: `**寒さ：** 夜の尾根では強風とともに0°C以下になることがあります。寒さを感じる前に、早めに防寒着を着てください。危険なサイン：激しい震え、ろれつが回らない、混乱、ふらつき。風を避け、すべての防寒着とエマージェンシーブランケットを身につけ、助けを呼んでください。` },
          { type: 'p', text: `**暑さ：** 暑いときはペースを落としてください。水だけでなく電解質ドリンクも飲み、のどの渇きに応じて飲んでください。エイドステーションでは氷と水で頭と首を冷やしてください。危険なサイン：頭痛、めまい、嘔吐、混乱。日陰で止まり、体を冷やし、助けを呼んでください。` },
          { type: 'p', text: `**火災：** 火や煙を見たら000に電話してください。火から離れ、最寄りのエイドステーションか道路に向かい、大会スタッフの指示に従ってください。VicEmergencyアプリで火災警報を確認できます。` }
        ] },
        { n: '07', title: `ヘビに咬まれたら`, blocks: [
          { type: 'alert', title: `動かないでください。じっとしていると毒が広がりにくくなります。`, steps: [
            `ヘビから数歩離れてください。捕まえたり、種類を確かめたりしないでください。`,
            `座るか横になってください。落ち着いて、じっとしていてください。`,
            `000に電話し、次にメディカルチームに電話してください。3つの単語を伝えてください。`,
            `咬まれた所を覆うように、包帯をしっかり巻いてください。`,
            `次に2本目の包帯を、手または足の指の付け根のすぐ上から巻き始め、脚または腕全体を届く限り上まで巻いてください。足首のねんざのときのように、しっかりきつく巻きます。包帯に長方形の印がある場合は、正方形になるまで引っ張って巻いてください。包帯が1本しかなければ、他のランナーの包帯を借りてください。`,
            `手足をまっすぐにして動かさないでください。ポールや枝を添え木にし、咬まれた所の上下の関節まで固定してください。包帯と添え木は、医療スタッフが外すまで外さないでください。`,
            `咬まれた所を洗わないでください。切らないでください。止血帯は使わないでください。`,
            `その場で助けが来るのを待ってください。歩いて移動しないでください。`
          ], after: [`咬まれても、枝でひっかいた程度にしか感じないことがあります。小さな2つの傷跡を探してください。多くは脚の下の方（すね・足首）にあります。わからない場合は、咬まれたものとして対処してください。`] },
          { type: 'p', text: `**ヘビを見かけたら：** 止まり、ゆっくり後ろに下がって距離をとってください。ヘビは逃げたがっています。ヘビがトレイルから離れるまで待ってください。` }
        ] },
        { n: '08', title: `他のランナーが助けを必要としているとき`, blocks: [
          { type: 'bullets', items: [
            `止まってください。まず自分の安全を確認してください。`,
            `命に関わる場合は000に電話し、次にメディカルチームに電話してください。`,
            `そばにいてください。その人の体を温めてください。暑いときは日差しを遮ってください。その人のエマージェンシーブランケットで体を包んでください。`,
            `助けを呼びに行く場合は、別のランナーにそばにいてもらってください。けが人のゼッケンとEmergency+の画面を写真に撮り、次のエイドステーションに伝えてください。`,
            `ヘビに咬まれた場合：セクション07のとおりに包帯を巻くのを手伝ってください。2本目の包帯が必要なら、あなたの包帯を使ってください。`,
            `その場所が危険でない限り、動かさないでください。`
          ] }
        ] }
      ]
    },
    zh: {
      lang: 'zh-Hans',
      intro: `出发前请阅读本卡，并随身放在背包里。`,
      summaryTitle: `紧急情况下`,
      summary: [
        ['停下', 'STOP', `确保自身安全。被咬伤后保持静止。`],
        ['拨打', 'CALL', `先拨000，再拨医疗团队 1300 375 352。`],
        ['告知', 'TELL', `Emergency+上的三个单词、号码布号码、发生了什么。`],
        ['等待', 'STAY', `陪在伤者身边。原地等待救援。`]
      ],
      sections: [
        { n: '01', title: `紧急电话`, blocks: [
          { type: 'alert', title: `危及生命的紧急情况：先拨打000`, text: [
            `需要救护车、警察或消防时，请拨打000（Triple Zero）。用手机也可以拨打112。通话免费，只要有信号，任何网络都能拨通。`,
            `危及生命的情况包括：没有呼吸、失去知觉、大量出血、胸痛、被蛇咬伤，或身体极度寒冷或过热且意识混乱。`,
            `英语不好？仍然要拨打000。先说“Ambulance”，再说“Victoria”，然后用英语说出你的语言（“Mandarin”）。不要挂断电话，翻译会加入通话，可能需要等一会儿。`
          ] },
          { type: 'p', text: `然后拨打医疗团队的电话。其他事情请打电话给你的赛事经理。出发前请把这两个号码存入手机。医疗团队使用英语。如果你无法说明情况，请拨打000并要求翻译。` },
          { type: 'table', rows: [[`医疗团队`, `1300 375 352`], [`你的赛事经理`, `号码印在号码布背面`]] }
        ] },
        { n: '02', title: `告诉我们你在哪里`, blocks: [
          { type: 'steps', items: [
            `打开Emergency+应用。`,
            `按照屏幕显示，用英语准确读出三个单词（what3words）。如果单词不是英文，或英语有困难，改为读出GPS数字。接通000的翻译后，可以用中文说这些数字。`,
            `说出你的号码布号码、最后经过的补给站，以及发生了什么。`
          ] },
          { type: 'p', text: `使用Telstra SIM卡拨打000时，手机通常也会自动发送你的位置。请务必说明你在哪里。` },
          { type: 'p', text: `**没有手机信号？** 如果你没有受伤，请继续前往下一个补给站或有信号的地方再打电话。如果你受伤了，请留在原地，拦住下一位跑者，请他拍下你的号码布和Emergency+屏幕，带到下一个补给站。` }
        ] },
        { n: '03', title: `迷路或退赛`, blocks: [
          { type: 'p', text: `**迷路了？** 停下来。回到你最后看到的标记处，用TERRAiNAV应用查看离线地图。沿着橙色反光标记和黄色的Grampians Peaks Trail三角标志前进。红色叉号表示走错方向。` },
          { type: 'p', text: `**要退赛？** 请把你的号码布号码告诉补给站工作人员。如果你在其他地方离开赛道，必须打电话给你的赛事经理。如果你不告诉我们，我们会开始搜寻你。` }
        ] },
        { n: '04', title: `出发前检查`, blocks: [
          { type: 'check', items: [
            `手机充满电，并装有Telstra SIM卡。携带充电宝。`,
            `已安装Emergency+和VicEmergency应用。`,
            `已在TERRAiNAV应用中下载离线赛道地图。`,
            `已将赛事电话号码存入手机。`,
            `已安装Google Translate（谷歌翻译），并下载了中文离线包。`,
            `蛇咬伤绷带放在随手可拿的口袋里。`,
            `报名信息中的紧急联系人和医疗信息正确无误。`
          ] }
        ] },
        { n: '05', title: `出示本卡`, blocks: [
          { type: 'p', text: `我们的工作人员和医疗团队会使用翻译应用。如果你无法说明情况，请出示本卡并指给他们看。` }
        ] },
        { n: '06', title: `天气与火灾`, blocks: [
          { type: 'p', text: `**寒冷：** 夜间山脊可能降到0°C以下，并伴有强风。在感到冷之前就尽早穿上保暖衣物。危险信号：剧烈发抖、说话含糊、意识混乱、步履蹒跚。请找地方避风，穿上所有衣物并裹上急救毯，然后求助。` },
          { type: 'p', text: `**炎热：** 天气炎热时请放慢速度。除了清水，也要喝电解质饮料，口渴就喝。在补给站用冰和水给头部和颈部降温。危险信号：头痛、头晕、呕吐、意识混乱。请在阴凉处停下，降温并求助。` },
          { type: 'p', text: `**火灾：** 如果看到火或烟，请拨打000。远离火源，前往最近的补给站或道路，并听从赛事工作人员的指示。VicEmergency应用会显示火灾警报。` }
        ] },
        { n: '07', title: `被蛇咬伤`, blocks: [
          { type: 'alert', title: `不要移动。保持静止可以减缓毒液扩散。`, steps: [
            `离开蛇几步远。不要试图抓蛇或辨认蛇的种类。`,
            `坐下或躺下。保持静止和冷静。`,
            `先拨打000，再拨打医疗团队电话。说出你的三个单词。`,
            `用绷带把咬伤处紧紧包扎好。`,
            `然后用第二条绷带从紧挨手指或脚趾的上方开始，向上缠绕整条腿或整只手臂，尽量缠到最高处。要缠得紧，像包扎扭伤的脚踝一样。如果绷带上有长方形图案，拉紧到它们变成正方形为止。只有一条绷带？向其他跑者借一条。`,
            `保持肢体伸直不动。用登山杖或树枝作夹板固定，范围包括咬伤处上下的关节。在医护人员取下之前，不要拆除绷带和夹板。`,
            `不要清洗伤口，不要切开伤口，不要使用止血带。`,
            `原地等待救援人员赶来，不要自己走出去。`
          ], after: [`被蛇咬时可能只像被树枝划了一下。注意寻找两个小伤口，通常在小腿。如果不确定，请按蛇咬伤处理。`] },
          { type: 'p', text: `**如果看到蛇：** 停下，慢慢后退，给它留出空间。蛇想离开。等它离开步道后再走。` }
        ] },
        { n: '08', title: `其他跑者需要帮助时`, blocks: [
          { type: 'bullets', items: [
            `停下来。先确保自己安全。`,
            `如果危及生命，先拨打000，再拨打医疗团队电话。`,
            `陪在他身边。给他保暖；天气炎热时，为他遮挡阳光。用他的急救毯裹住他。`,
            `如果你要去求助，请确保有另一位跑者留下陪伴。拍下伤者的号码布和Emergency+屏幕，并告知下一个补给站。`,
            `被蛇咬伤：按照第07部分帮他包扎。如果需要第二条绷带，用你的。`,
            `除非他所在的位置有危险，否则不要移动他。`
          ] }
        ] }
      ]
    },
    ru: {
      lang: 'ru',
      intro: `Прочитайте перед стартом. Держите карточку в рюкзаке.`,
      summaryTitle: `В экстренной ситуации`,
      summary: [
        ['СТОП', 'STOP', `Убедитесь, что вы в безопасности. При укусе не двигайтесь.`],
        ['ЗВОНИТЕ', 'CALL', `Сначала 000, затем медицинской бригаде 1300 375 352.`],
        ['СООБЩИТЕ', 'TELL', `Три слова из Emergency+, стартовый номер, что случилось.`],
        ['ЖДИТЕ', 'STAY', `Оставайтесь с пострадавшим. Ждите помощи на месте.`]
      ],
      sections: [
        { n: '01', title: `Экстренные номера`, blocks: [
          { type: 'alert', title: `УГРОЗА ЖИЗНИ: СНАЧАЛА ЗВОНИТЕ 000`, text: [
            `Звоните 000 (Triple Zero): скорая помощь, полиция, пожарные. С мобильного также работает 112. Звонок бесплатный и проходит в любой сети с сигналом.`,
            `Угроза жизни: не дышит, без сознания, сильное кровотечение, боль в груди, укус змеи, сильное переохлаждение или перегрев со спутанностью сознания.`,
            `Плохо говорите по-английски? Всё равно звоните 000. Скажите «Ambulance», затем «Victoria», затем «Russian». Не кладите трубку: подключится переводчик, это может занять минуту.`
          ] },
          { type: 'p', text: `Затем звоните медицинской бригаде, по остальным вопросам менеджеру забега. Сохраните оба номера до старта. Бригада говорит по-английски. Не можете объяснить? Звоните 000 и попросите переводчика.` },
          { type: 'table', rows: [[`Медицинская бригада`, `1300 375 352`], [`Ваш менеджер забега`, `Телефон на обороте стартового номера`]] }
        ] },
        { n: '02', title: `Сообщите, где вы находитесь`, blocks: [
          { type: 'steps', items: [
            `Откройте приложение Emergency+.`,
            `Прочитайте по-английски три слова (what3words), как они показаны. Слова не на английском или трудно по-английски? Прочитайте GPS-координаты (цифры): с переводчиком 000 цифры можно назвать по-русски.`,
            `Назовите свой стартовый номер, последний пройденный пункт питания и что случилось.`
          ] },
          { type: 'p', text: `С SIM-картой Telstra звонок на 000 обычно сам передаёт ваше местоположение. Всё равно назовите его.` },
          { type: 'p', text: `**Нет сигнала?** Нет травмы: идите до следующего пункта питания или места с сигналом и звоните оттуда. Есть травма: оставайтесь на месте, остановите следующего бегуна. Пусть он сфотографирует ваш стартовый номер и экран Emergency+ и отнесёт снимки на следующий пункт питания.` }
        ] },
        { n: '03', title: `Заблудились или сходите с дистанции`, blocks: [
          { type: 'p', text: `**Заблудились?** Остановитесь. Вернитесь к последней увиденной метке и проверьте офлайн-карту в TERRAiNAV. Следуйте оранжевым светоотражающим меткам и жёлтым треугольникам Grampians Peaks Trail. Красный крест: неверное направление.` },
          { type: 'p', text: `**Сходите с дистанции?** Сообщите стартовый номер на пункте питания. Сходите в другом месте? Обязательно позвоните менеджеру забега, иначе мы начнём поиски.` }
        ] },
        { n: '04', title: `Перед стартом`, blocks: [
          { type: 'check', items: [
            `Телефон заряжен, SIM-карта Telstra, пауэрбанк.`,
            `Установлены Emergency+ и VicEmergency.`,
            `Офлайн-карта загружена в TERRAiNAV.`,
            `Номера организаторов сохранены в телефоне.`,
            `Google Translate: русский язык загружен офлайн.`,
            `Бинт от укуса змеи под рукой.`,
            `Экстренный контакт и медданные в регистрации верны.`
          ] }
        ] },
        { n: '05', title: `Покажите эту карточку`, blocks: [
          { type: 'p', text: `Команда и медики пользуются переводчиками в телефоне. Не можете объяснить? Покажите карточку и укажите нужный пункт.` }
        ] },
        { n: '06', title: `Погода и пожар`, blocks: [
          { type: 'p', text: `**Холод.** Ночью на хребтах бывает ниже 0°C и сильный ветер. Утепляйтесь заранее, пока не замёрзли. Тревожные признаки: сильная дрожь, невнятная речь, спутанность сознания, шаткая походка. Укройтесь от ветра, наденьте все слои, укутайтесь в спасательное одеяло, вызовите помощь.` },
          { type: 'p', text: `**Жара.** В жару снизьте темп. Пейте электролиты, а не только воду, по жажде. На пунктах питания охлаждайте голову и шею льдом и водой. Тревожные признаки: головная боль, головокружение, рвота, спутанность сознания. В тени охладитесь и вызовите помощь.` },
          { type: 'p', text: `**Пожар.** Видите огонь или дым? Звоните 000. Уходите от огня к ближайшему пункту питания или дороге и выполняйте указания организаторов. VicEmergency показывает предупреждения о пожарах.` }
        ] },
        { n: '07', title: `Укус змеи`, blocks: [
          { type: 'alert', title: `НЕ ДВИГАЙТЕСЬ. НЕПОДВИЖНОСТЬ ЗАМЕДЛЯЕТ РАСПРОСТРАНЕНИЕ ЯДА.`, steps: [
            `Отойдите от змеи на несколько шагов. Не пытайтесь её поймать или определить вид.`,
            `Сядьте или лягте. Сохраняйте неподвижность и спокойствие.`,
            `Позвоните 000, затем медицинской бригаде. Назовите свои три слова.`,
            `Туго наложите бинт прямо на место укуса.`,
            `Затем наложите второй бинт: начиная чуть выше пальцев руки или ноги, бинтуйте вверх по всей руке или ноге, насколько хватит. Туго, как при растяжении голеностопа. Если на бинте есть прямоугольники, натягивайте его, пока они не станут квадратами. Только один бинт? Попросите бинт у другого бегуна.`,
            `Держите конечность прямо и неподвижно. Наложите шину из трекинговой палки или ветки, захватив суставы выше и ниже укуса. Не снимайте бинты и шину, пока их не снимут медики.`,
            `Не промывайте место укуса. Не делайте надрезов. Не накладывайте жгут.`,
            `Ждите, пока помощь придёт к вам. Никуда не идите.`
          ], after: [`Укус может ощущаться как царапина от ветки. Ищите две маленькие ранки, чаще на голени. Не уверены? Действуйте как при укусе.`] },
          { type: 'p', text: `**Если видите змею:** остановитесь, медленно отойдите назад и подождите, пока змея уползёт с тропы.` }
        ] },
        { n: '08', title: `Если помощь нужна другому бегуну`, blocks: [
          { type: 'bullets', items: [
            `Остановитесь. Сначала убедитесь, что вы в безопасности.`,
            `При угрозе жизни звоните 000, затем медицинской бригаде.`,
            `Оставайтесь с пострадавшим. Согревайте его, в жару защитите от солнца. Укройте пострадавшего его же спасательным одеялом.`,
            `Идёте за помощью? Пусть с пострадавшим останется другой бегун. Сфотографируйте стартовый номер пострадавшего и его экран Emergency+ и сообщите на следующий пункт питания.`,
            `Укус змеи: помогите наложить бинты, как описано в разделе 07. Если нужен второй бинт, дайте свой.`,
            `Не перемещайте пострадавшего, если на месте ему ничего не угрожает.`
          ] }
        ] }
      ]
    },
    pl: {
      lang: 'pl',
      intro: `Przeczytaj przed startem. Trzymaj kartę w plecaku.`,
      summaryTitle: `W nagłej sytuacji`,
      summary: [
        ['STÓJ', 'STOP', `Zadbaj o swoje bezpieczeństwo. Po ukąszeniu nie ruszaj się.`],
        ['DZWOŃ', 'CALL', `Najpierw 000, potem zespół medyczny 1300 375 352.`],
        ['POWIEDZ', 'TELL', `Trzy słowa z Emergency+, numer startowy, co się stało.`],
        ['ZOSTAŃ', 'STAY', `Zostań z poszkodowanym. Czekaj na pomoc na miejscu.`]
      ],
      sections: [
        { n: '01', title: `Numery alarmowe`, blocks: [
          { type: 'alert', title: `ZAGROŻENIE ŻYCIA: NAJPIERW DZWOŃ POD 000`, text: [
            `Dzwoń pod 000 (Triple Zero): karetka, policja, straż pożarna. Z telefonu komórkowego działa też 112. Połączenie jest bezpłatne i działa w każdej sieci z zasięgiem.`,
            `Zagrożenie życia to: brak oddechu, utrata przytomności, silne krwawienie, ból w klatce piersiowej, ukąszenie węża, silne wychłodzenie lub przegrzanie z dezorientacją.`,
            `Słabo mówisz po angielsku? I tak dzwoń pod 000. Powiedz „Ambulance”, potem „Victoria”, potem nazwę swojego języka po angielsku („Polish”). Nie rozłączaj się. Dołączy tłumacz. Może to potrwać minutę.`
          ] },
          { type: 'p', text: `Potem zadzwoń do zespołu medycznego, a w innych sprawach do kierownika biegu. Przed startem zapisz oba numery w telefonie. Zespół medyczny mówi po angielsku. Nie możesz się porozumieć? Dzwoń pod 000 i poproś o tłumacza.` },
          { type: 'table', rows: [[`Zespół medyczny`, `1300 375 352`], [`Twój kierownik biegu`, `Nr telefonu na odwrocie numeru startowego`]] }
        ] },
        { n: '02', title: `Powiedz nam, gdzie jesteś`, blocks: [
          { type: 'steps', items: [
            `Otwórz aplikację Emergency+.`,
            `Przeczytaj po angielsku trzy słowa (what3words) dokładnie tak, jak są wyświetlone. Nie są po angielsku albo angielski jest trudny? Podaj współrzędne GPS (liczby): gdy dołączy tłumacz 000, liczby możesz podać po polsku.`,
            `Podaj swój numer startowy, ostatni minięty punkt odżywczy i co się stało.`
          ] },
          { type: 'p', text: `Z kartą SIM Telstra połączenie z 000 zwykle przesyła też lokalizację telefonu. Zawsze powiedz, gdzie jesteś.` },
          { type: 'p', text: `**Brak zasięgu?** Bez urazu: idź dalej do następnego punktu odżywczego lub miejsca z zasięgiem i zadzwoń stamtąd. Masz uraz: zostań na miejscu i zatrzymaj następnego biegacza. Niech sfotografuje twój numer startowy i ekran Emergency+ i zaniesie zdjęcia do następnego punktu odżywczego.` }
        ] },
        { n: '03', title: `Zgubiony szlak lub zejście z trasy`, blocks: [
          { type: 'p', text: `**Zgubiony szlak?** Zatrzymaj się. Wróć do ostatniego widzianego oznaczenia i sprawdź mapę offline w aplikacji TERRAiNAV. Kieruj się pomarańczowymi oznaczeniami odblaskowymi i żółtymi trójkątami Grampians Peaks Trail. Czerwony krzyżyk oznacza złą drogę.` },
          { type: 'p', text: `**Schodzisz z trasy?** Podaj swój numer startowy obsłudze punktu odżywczego. Jeśli opuszczasz trasę w innym miejscu, musisz zadzwonić do kierownika biegu. Jeśli nam nie powiesz, rozpoczniemy poszukiwania.` }
        ] },
        { n: '04', title: `Przed startem`, blocks: [
          { type: 'check', items: [
            `Telefon naładowany, karta SIM Telstra, powerbank.`,
            `Zainstalowane Emergency+ i VicEmergency.`,
            `Mapa trasy offline pobrana w TERRAiNAV.`,
            `Numery organizatora zapisane w telefonie.`,
            `Google Translate z językiem polskim offline.`,
            `Bandaż na ukąszenie węża pod ręką.`,
            `Poprawny kontakt alarmowy (osoba do powiadomienia) i dane medyczne w rejestracji.`
          ] }
        ] },
        { n: '05', title: `Pokaż tę kartę`, blocks: [
          { type: 'p', text: `Obsługa i zespół medyczny korzystają z aplikacji do tłumaczenia. Nie możesz wyjaśnić? Pokaż kartę i wskaż odpowiedni fragment.` }
        ] },
        { n: '06', title: `Pogoda i pożar`, blocks: [
          { type: 'p', text: `**Zimno.** W nocy na grzbietach bywa poniżej 0°C i wieje silny wiatr. Załóż ciepłe warstwy, zanim zmarzniesz. Objawy ostrzegawcze: silne dreszcze, bełkotliwa mowa, dezorientacja, potykanie się. Schroń się przed wiatrem, załóż wszystkie warstwy, owiń się kocem ratunkowym (folią NRC) i wezwij pomoc.` },
          { type: 'p', text: `**Upał.** W upale zwolnij. Pij elektrolity, nie tylko wodę, i pij, gdy czujesz pragnienie. Na punktach odżywczych chłodź głowę i kark lodem i wodą. Objawy ostrzegawcze: ból głowy, zawroty głowy, wymioty, dezorientacja. Zatrzymaj się w cieniu, schłodź się i wezwij pomoc.` },
          { type: 'p', text: `**Pożar.** Widzisz ogień lub dym? Dzwoń pod 000. Oddal się od ognia w stronę najbliższego punktu odżywczego lub drogi i stosuj się do poleceń obsługi zawodów. VicEmergency pokazuje ostrzeżenia pożarowe.` }
        ] },
        { n: '07', title: `Ukąszenie węża`, blocks: [
          { type: 'alert', title: `NIE RUSZAJ SIĘ. BEZRUCH SPOWALNIA ROZPRZESTRZENIANIE SIĘ JADU.`, steps: [
            `Odejdź kilka kroków od węża. Nie próbuj go łapać ani rozpoznawać.`,
            `Usiądź lub połóż się. Zachowaj spokój i bezruch.`,
            `Zadzwoń pod 000, potem do zespołu medycznego. Podaj swoje trzy słowa.`,
            `Załóż mocny bandaż na miejsce ukąszenia.`,
            `Potem drugim bandażem owiń całą nogę lub rękę, zaczynając tuż nad palcami dłoni lub stopy, jak najwyżej. Mocno i ciasno, jak przy skręconej kostce. Prostokąty na bandażu? Naciągaj, aż staną się kwadratami. Masz tylko jeden bandaż? Poproś innego biegacza o jego bandaż.`,
            `Trzymaj kończynę prosto i nieruchomo. Unieruchom ją szyną (kijkiem trekkingowym lub gałęzią), obejmując stawy powyżej i poniżej ukąszenia. Nie zdejmuj bandaży ani szyny, dopóki nie zdejmie ich personel medyczny.`,
            `Nie myj miejsca ukąszenia. Nie nacinaj go. Nie zakładaj opaski uciskowej (stazy).`,
            `Czekaj, aż pomoc dotrze do ciebie. Nigdzie nie idź.`
          ], after: [`Ukąszenie można odczuć jak zadrapanie gałązką. Szukaj dwóch małych ranek, często na podudziu. Jeśli nie masz pewności, postępuj jak przy ukąszeniu.`] },
          { type: 'p', text: `**Jeśli widzisz węża:** zatrzymaj się, powoli się cofnij i zostaw mu miejsce. Wąż chce odejść. Poczekaj, aż zejdzie ze szlaku.` }
        ] },
        { n: '08', title: `Gdy inny biegacz potrzebuje pomocy`, blocks: [
          { type: 'bullets', items: [
            `Zatrzymaj się. Najpierw zadbaj o własne bezpieczeństwo.`,
            `Przy zagrożeniu życia dzwoń pod 000, potem do zespołu medycznego.`,
            `Zostań z poszkodowanym. Ogrzewaj go, a w upale osłoń go przed słońcem. Owiń poszkodowanego jego kocem ratunkowym.`,
            `Idziesz po pomoc? Niech inny biegacz zostanie z poszkodowanym. Sfotografuj numer startowy poszkodowanego i jego ekran Emergency+ i powiadom następny punkt odżywczy.`,
            `Ukąszenie węża: pomóż założyć bandaże jak w sekcji 07. Jeśli potrzebny jest drugi bandaż, daj swój.`,
            `Nie przemieszczaj poszkodowanego, chyba że na miejscu grozi mu niebezpieczeństwo.`
          ] }
        ] }
      ]
    }
  }
};
