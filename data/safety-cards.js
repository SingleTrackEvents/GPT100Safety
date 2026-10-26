// The runner app's Help tab, in five languages: English, Japanese, Simplified Chinese, Russian and Polish.
// It carries the GPT100 emergency card for international runners (GPT100_InternationalRunners_EmergencyCard_2026_v0_5
// and its translations, Drive: GPT100 / International Runners Emergency), rewritten around the app's own tools: Call 000
// and Call race medical, Find my 3 words (what3words and GPS numbers), Share my location, the Map tab's Where am I,
// and the Gear tab. Where the printed card says Emergency+ or TERRAiNAV, the app says its own button; Emergency+ stays
// as the backup. The weather, snake bite and helping-another-runner text is the card's, word for word.
// `ui` holds the app's own labels and status lines. `help` holds the card text. Both are per language.
// Translation status (21 October 2026): the card sentences are the v0.5 translations (Chinese checked by Joe Zhang,
// Japanese with Mirai, Russian and Polish unchecked). The app-only sentences (ui, and the card sentences that now name
// the app's buttons) are new and still need the interpreter check, as is w3wStored (24 October 2026, the saved
// three words shown with no signal), and w3wNoLive, w3wStoredNoLive and the off-course lines on the map (offBy, offBack,
// offLine, offFar, dirs; 26 October 2026), and the map's position and arrival lines and the far-off Share lines (located
// to foundFar, also 26 October 2026). Keep this file in step with the documents.
// Markup in the text: **bold**. 000, 112 and the Medical Team number become tap-to-call links. {km} {acc} {time} {send}
// {m} {dist} {dir} {race} {len} {name} {dur} are filled in by the app.
window.GPT_SAFETY_CARDS = {
  version: '0.5',
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
      ui: {
        needHelp: `Need help?`, call000: `Call 000`, call000Sub: `Ambulance, police or fire. Free, on any network with signal.`,
        callMed: `Call race medical`, callMedSub: `The Medical Team speaks English. If you cannot explain, call 000 and ask for an interpreter. For anything else, call your Race Manager: the number is on the back of your bib.`,
        whereTitle: `Tell us where you are`, w3wTitle: `Your three words`,
        w3wIntro: `Tap Find my 3 words. The app shows three words (what3words) for the 3 m square you're standing in, and your GPS numbers. Read them out, in English, to 000 or race medical.`,
        find3: `Find my 3 words`, update3: `Update my 3 words`, finding: `Finding you… (stand in the open)`,
        w3wReady: `Your spot at {time}, to within 3 m. Read these three words out in English, exactly as shown.`,
        w3wGetting: `Getting your three words… If they don't come, read out the numbers.`,
        w3wNoSignal: `No signal for the three words. Read out these numbers instead: your position. You can say them in your own language once the 000 interpreter is on the line.`,
        w3wStored: `No signal, so these are the saved three words for the nearest point of the course, {m} m from you. Read them out in English, then the GPS numbers too.`,
        nums: `GPS numbers`, share: `Share my location`, send: `Send my location`,
        shareHint: `Finds your position first, then sends your race km and position by text or WhatsApp.`,
        shareReady: `Ready: km {km}, GPS ±{acc} m. Sends your race km and position by text or WhatsApp.`,
        found: `Found you at km {km} (GPS ±{acc} m). Tap {send} again to send it.`,
        gpsBlocked: `Location is blocked for this site. Allow location in the phone settings.`, gpsNone: `No GPS fix yet. Try again in the open.`,
        w3wNoLive: `The three words aren't available right now. Read out these numbers instead: your position. You can say them in your own language once the 000 interpreter is on the line.`,
        w3wStoredNoLive: `The three words aren't available right now, so these are the saved three words for the nearest point of the course, {m} m from you. Read them out in English, then the GPS numbers too.`,
        offBy: `{dist} off the course.`, offBack: `Go back the way you came to the last course marker you saw.`,
        offLine: `Straight line to the course: {dist}, {dir} of you. It may not be walkable.`,
        offFar: `You're {dist} from the {race} course. Check the race picked at the top.`,
        dirs: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'],
        located: `Found you: accurate to about {acc} m.`, poorGps: `GPS only ±{acc} m: stand in the open and tap ◎ again.`, raceStarts: `Race starts {time}.`,
        kmOf: `**Km {km}** of {len}`, next: `Next: **{name}** in **{dist}**`, backNext: `Back on the course, next: **{name}** in **{dist}**`, cutoff: `cut-off **{time}**`, atFinish: `At the finish.`,
        etaAt: `At your pace about **{time}**.`, etaOn: `At your pace about **{time}**, on the cut-off.`, etaBefore: `At your pace about **{time}**, {dur} before the cut-off.`,
        etaLate: `**At your pace about {time}, after the cut-off.** Talk to the aid station team.`, etaBehind: `**Well behind cut-off pace.** Talk to the aid station team.`,
        shareFar: `Ready: you're {dist} from the {race} course (GPS ±{acc} m). Check the race picked at the top, then send.`,
        foundFar: `Found you, {dist} from the {race} course (GPS ±{acc} m). Check the race picked at the top, then tap {send} again to send it.`,
        lostTitle: `Lost or stopping`, openMap: `Open the map`, gearTab: `Mandatory gear is on the Gear tab.`,
        summaryTitle: `In an emergency`, showEnglish: `Show in English`, backTo: `English`,
        note: `Based on the GPT100 Emergency Card v0.5 (October 2026), which is also printed and handed out at registration.`
      },
      help: {
        interp: { title: `Life-threatening emergency: call 000 first`, text: [
          `000 (Triple Zero) is free and works on any network with signal. 112 also works from a mobile. Life-threatening means: not breathing, unconscious, heavy bleeding, chest pain, snake bite, or very cold or very hot and confused.`,
          `Not confident in English? Still call 000. Say “Ambulance”, then “Victoria”, then the name of your language in English. Stay on the line. An interpreter will join. This can take a minute. If the line is silent, wait up to 60 seconds.`
        ] },
        where: { steps: [
          `Tap **Find my 3 words**. The app shows three words (what3words) for the 3 m square you are standing in, and your GPS numbers.`,
          `Read out the three words exactly as shown, in English. If English is hard, read out the GPS numbers instead. You can say the numbers in your own language once the 000 interpreter is on the line.`,
          `Give your bib number, the last aid station you passed, and what happened.`
        ], notes: [
          `**Share my location** sends your race km, position and three words by text or WhatsApp, for example to your crew or the next aid station.`,
          `With a Telstra SIM, calling 000 usually also sends your phone's location. Always say where you are.`,
          `**No phone signal?** The GPS numbers still work. If you are not hurt, walk on to the next aid station or a place with signal and call from there. If you are hurt, stay where you are and stop the next runner. Let them photograph your bib and this screen. They take it to the next aid station.`,
          `The Emergency+ app shows the same three words and numbers, if this app can't.`
        ] },
        lost: [
          `**Lost?** Stop. Go back to the last marker you saw. Open the **Map** tab and tap ◎: it shows how far you are from the course and which way it is. Follow the orange reflective markers and the yellow Grampians Peaks Trail triangles. A red cross means wrong way.`,
          `**Stopping the race?** Tell the aid station crew your bib number. If you leave the course anywhere else, you must phone your Race Manager. If you do not tell us, we start a search for you.`,
          `**Hurt?** Stay on the course if you can: it is where we will look for you. Keep warm and stop the next runner.`
        ],
        summary: [
          ['STOP', '', `Make sure you are safe. If bitten, keep still.`],
          ['CALL', '', `000 first, then the Medical Team on 1300 375 352.`],
          ['TELL', '', `Your three words from this screen, your bib number, what happened.`],
          ['STAY', '', `Stay with an injured runner. Wait for help to come to you.`]
        ],
        sections: [
          { title: `Snake bite`, blocks: [
            { type: 'alert', title: `DO NOT MOVE. KEEPING STILL SLOWS THE VENOM SPREADING.`, steps: [
              `Move a few steps away from the snake. Do not try to catch it or identify it.`,
              `Sit or lie down. Stay still and calm.`,
              `Call 000, then race medical: the buttons at the top. Give your three words.`,
              `Put a firm bandage over the bite.`,
              `Then wrap a second bandage from just above the fingers or toes up the whole leg or arm, as far as it reaches. Firm and tight, like for a sprained ankle. If the bandage has rectangles, stretch it until they become squares. Only one bandage? Ask another runner for theirs.`,
              `Keep the limb straight and still. Splint it with a pole or stick, covering the joints above and below the bite. Leave the bandages and splint on until medical staff remove them.`,
              `Do not wash the bite. Do not cut it. Do not use a tourniquet.`,
              `Wait for help to come to you. Do not walk out.`
            ], after: [`A bite can feel like a scratch from a stick. Look for two small marks, often on the lower leg. If you are not sure, treat it as a bite.`] },
            { type: 'p', text: `**If you see a snake:** stop, step back slowly and give it space. It wants to leave. Wait until it moves off the trail.` }
          ] },
          { title: `If another runner needs help`, blocks: [
            { type: 'bullets', items: [
              `Stop. Make sure you are safe first.`,
              `Call 000 if it is life-threatening, then the Medical Team.`,
              `Stay with them. Keep them warm, or shade them from the sun if it is hot. Put their emergency blanket around them.`,
              `If you go for help, make sure another runner stays with them. Photograph the injured runner's bib and the three words for that spot (Find my 3 words on your phone), and tell the next aid station.`,
              `Snake bite: help them bandage as in Snake bite above. If they need a second bandage, use yours.`,
              `Do not move them unless they are in danger where they are.`
            ] }
          ] },
          { title: `Weather and fire`, blocks: [
            { type: 'p', text: `**Cold.** The ridges can drop below 0°C at night with strong wind. Put on your warm layers early, before you feel cold. Warning signs: strong shivering, slurred speech, confusion, stumbling. Get out of the wind, put on every layer and your emergency blanket, and call for help.` },
            { type: 'p', text: `**Heat.** Slow down when it is hot. Drink electrolyte, not only plain water, and drink to thirst. Use ice and water on your head and neck at aid stations. Warning signs: headache, dizziness, vomiting, confusion. Stop in shade, cool down and call for help.` },
            { type: 'p', text: `**Fire.** If you see fire or smoke, call 000. Move away from it, toward the nearest aid station or road, and follow instructions from event crew. The VicEmergency app shows fire warnings.` }
          ] },
          { title: `Before you start`, blocks: [
            { type: 'check', items: [
              `This app on your home screen, with the map saved for offline (Home tab).`,
              `Phone fully charged, with a Telstra SIM. Carry a power bank.`,
              `Emergency+ and VicEmergency apps installed.`,
              `Race medical 1300 375 352 and your Race Manager's number (on your bib) saved in your phone.`,
              `Google Translate installed, with your language downloaded for offline use.`,
              `Snake bandage in a pocket you can reach quickly.`,
              `Emergency contact and medical details correct in your registration.`
            ] },
            { type: 'gear' }
          ] },
          { title: `Show this screen`, blocks: [
            { type: 'p', text: `Our crew and Medical Team use translation apps. If you cannot explain, show them this screen and point. The language picker at the top switches it to English, Japanese, Chinese, Russian or Polish.` }
          ] }
        ]
      }
    },
    ja: {
      lang: 'ja',
      ui: {
        needHelp: `助けが必要ですか？`, call000: `000に電話`, call000Sub: `救急車・警察・消防。無料で、電波があればどの通信会社でもつながります。`,
        callMed: `メディカルチームに電話`, callMedSub: `メディカルチームは英語で対応します。説明できない場合は000に電話し、通訳を頼んでください。それ以外のことはレースマネージャーに電話してください。番号はゼッケンの裏にあります。`,
        whereTitle: `現在地を伝える`, w3wTitle: `あなたの3つの単語`,
        w3wIntro: `「3つの単語を調べる」をタップしてください。あなたのいる3m四方を表す3つの単語（what3words）とGPSの数字が表示されます。000やメディカルチームに英語で読み上げてください。`,
        find3: `3つの単語を調べる`, update3: `3つの単語を更新`, finding: `現在地を確認中…（開けた場所に立ってください）`,
        w3wReady: `{time}の現在地、誤差3m以内。この3つの単語を表示どおり英語で読み上げてください。`,
        w3wGetting: `3つの単語を取得中…表示されない場合は数字を読み上げてください。`,
        w3wNoSignal: `電波がないため3つの単語を取得できません。代わりにこの数字（現在地）を読み上げてください。000の通訳につながったら日本語で言ってかまいません。`,
        w3wStored: `電波がないため、保存済みの3つの単語を表示しています。コース上であなたに最も近い地点（{m}m先）のものです。英語で読み上げ、続けてGPSの数字も読み上げてください。`,
        nums: `GPSの数字`, share: `現在地を共有`, send: `現在地を送信`,
        shareHint: `まず現在地を確認し、レースのkmと位置をSMSまたはWhatsAppで送ります。`,
        shareReady: `準備完了：{km}km、GPS誤差±{acc}m。レースのkmと位置をSMSまたはWhatsAppで送ります。`,
        found: `{km}km地点で見つかりました（GPS誤差±{acc}m）。もう一度「{send}」をタップして送信してください。`,
        gpsBlocked: `このサイトの位置情報が許可されていません。スマートフォンの設定で位置情報を許可してください。`, gpsNone: `まだGPSの位置が取得できません。開けた場所でもう一度お試しください。`,
        w3wNoLive: `現在3つの単語を取得できません。代わりにこの数字（現在地）を読み上げてください。000の通訳につながったら日本語で言ってかまいません。`,
        w3wStoredNoLive: `現在3つの単語を取得できないため、保存済みの3つの単語を表示しています。コース上であなたに最も近い地点（{m}m先）のものです。英語で読み上げ、続けてGPSの数字も読み上げてください。`,
        offBy: `コースから{dist}離れています。`, offBack: `来た道を戻り、最後に見たコースマーカーまで戻ってください。`,
        offLine: `コースまで直線で{dist}、{dir}の方向です。まっすぐには歩けない場合があります。`,
        offFar: `{race}のコースから{dist}離れています。上で選んだレースが正しいか確認してください。`,
        dirs: ['北', '北東', '東', '南東', '南', '南西', '西', '北西'],
        located: `現在地を確認しました：誤差は約{acc}mです。`, poorGps: `GPS誤差±{acc}m：開けた場所に立ち、もう一度◎をタップしてください。`, raceStarts: `スタートは{time}です。`,
        kmOf: `**{km}km**（全{len}km）`, next: `次：**{name}**まで**{dist}**`, backNext: `コースに戻ったら次：**{name}**まで**{dist}**`, cutoff: `関門 **{time}**`, atFinish: `ゴール地点です。`,
        etaAt: `今のペースで到着は**{time}**頃です。`, etaOn: `今のペースで到着は**{time}**頃、関門時刻ちょうどです。`, etaBefore: `今のペースで到着は**{time}**頃、関門の{dur}前です。`,
        etaLate: `**今のペースで到着は{time}頃、関門時刻を過ぎます。**エイドステーションのスタッフに相談してください。`, etaBehind: `**関門ペースより大幅に遅れています。**エイドステーションのスタッフに相談してください。`,
        shareFar: `準備完了：{race}のコースから{dist}離れています（GPS誤差±{acc}m）。上で選んだレースを確認してから送信してください。`,
        foundFar: `現在地を確認しました。{race}のコースから{dist}離れています（GPS誤差±{acc}m）。上で選んだレースを確認してから、もう一度「{send}」をタップして送信してください。`,
        lostTitle: `道に迷ったとき・レースをやめるとき`, openMap: `地図を開く`, gearTab: `必携装備はGearタブにあります。`,
        summaryTitle: `緊急時は`, showEnglish: `Show in English`, backTo: `日本語で表示`,
        note: `GPT100緊急時カード v0.5（2026年10月）に基づいています。同じカードを印刷したものを受付で配布します。`
      },
      help: {
        interp: { title: `命に関わる緊急事態：まず000に電話`, text: [
          `000（Triple Zero）は無料で、電波があればどの通信会社でもつながります。携帯電話からは112でもつながります。命に関わる状態とは：呼吸をしていない、意識がない、大量の出血、胸の痛み、ヘビに咬まれた、体がひどく冷えたり熱くなったりして混乱している、などです。`,
          `英語に自信がなくても、000に電話してください。まず「Ambulance」、次に「Victoria」、そして英語で「Japanese」と言ってください。電話を切らずに待ってください。通訳がつながります。少し時間がかかることがあります。無音でも最大60秒待ってください。`
        ] },
        where: { steps: [
          `**3つの単語を調べる**をタップしてください。あなたのいる3m四方を表す3つの単語（what3words）と、GPSの数字が表示されます。`,
          `3つの単語を、表示どおり英語で読み上げてください。英語が難しい場合はGPSの数字を読み上げ、000の通訳につながったら数字を日本語で言ってかまいません。`,
          `ゼッケン番号、最後に通過したエイドステーション、何が起きたかを伝えてください。`
        ], notes: [
          `**現在地を共有**は、レースのkm、位置、3つの単語をSMSまたはWhatsAppで送ります。クルーや次のエイドステーションなどに送れます。`,
          `TelstraのSIMで000に電話すると、通常は現在地も自動で送られます。必ず場所も伝えてください。`,
          `**電波がない場合：** GPSの数字は電波がなくても表示されます。けががなければ、次のエイドステーションか電波の届く場所まで進んで電話してください。けがをしている場合はその場を動かず、次に来たランナーを呼び止めてください。あなたのゼッケンとこの画面を写真に撮ってもらい、次のエイドステーションに届けてもらいます。`,
          `このアプリで表示できないときは、Emergency+アプリでも同じ3つの単語と数字が確認できます。`
        ] },
        lost: [
          `**道に迷ったら：** 止まってください。最後に見たマーカーまで戻ってください。**Map**タブを開いて◎をタップすると、コースからどれだけ離れているか、どの方向にあるかが表示されます。オレンジ色の反射マーカーと、黄色い三角形のGrampians Peaks Trail標識をたどってください。赤い×印は間違った方向という意味です。`,
          `**レースをやめるとき：** エイドステーションのスタッフにゼッケン番号を伝えてください。それ以外の場所でコースを離れる場合は、必ずレースマネージャーに電話してください。連絡がないと、私たちは捜索を開始します。`,
          `**けがをしたら：** できればコース上にとどまってください。私たちはコース上を捜索します。体を温かく保ち、次に来たランナーを呼び止めてください。`
        ],
        summary: [
          ['止まる', 'STOP', `自分の安全を確認。咬まれたら動かない。`],
          ['電話する', 'CALL', `まず000、次にメディカルチーム 1300 375 352。`],
          ['伝える', 'TELL', `この画面の3つの単語、ゼッケン番号、何が起きたか。`],
          ['待つ', 'STAY', `けが人のそばにいる。助けが来るのを待つ。`]
        ],
        sections: [
          { title: `ヘビに咬まれたら`, blocks: [
            { type: 'alert', title: `動かないでください。じっとしていると毒が広がりにくくなります。`, steps: [
              `ヘビから数歩離れてください。捕まえたり、種類を確かめたりしないでください。`,
              `座るか横になってください。落ち着いて、じっとしていてください。`,
              `000に電話し、次にメディカルチームに電話してください（上のボタン）。3つの単語を伝えてください。`,
              `咬まれた所を覆うように、包帯をしっかり巻いてください。`,
              `次に2本目の包帯を、手または足の指の付け根のすぐ上から巻き始め、脚または腕全体を届く限り上まで巻いてください。足首のねんざのときのように、しっかりきつく巻きます。包帯に長方形の印がある場合は、正方形になるまで引っ張って巻いてください。包帯が1本しかなければ、他のランナーの包帯を借りてください。`,
              `手足をまっすぐにして動かさないでください。ポールや枝を添え木にし、咬まれた所の上下の関節まで固定してください。包帯と添え木は、医療スタッフが外すまで外さないでください。`,
              `咬まれた所を洗わないでください。切らないでください。止血帯は使わないでください。`,
              `その場で助けが来るのを待ってください。歩いて移動しないでください。`
            ], after: [`咬まれても、枝でひっかいた程度にしか感じないことがあります。小さな2つの傷跡を探してください。多くは脚の下の方（すね・足首）にあります。わからない場合は、咬まれたものとして対処してください。`] },
            { type: 'p', text: `**ヘビを見かけたら：** 止まり、ゆっくり後ろに下がって距離をとってください。ヘビは逃げたがっています。ヘビがトレイルから離れるまで待ってください。` }
          ] },
          { title: `他のランナーが助けを必要としているとき`, blocks: [
            { type: 'bullets', items: [
              `止まってください。まず自分の安全を確認してください。`,
              `命に関わる場合は000に電話し、次にメディカルチームに電話してください。`,
              `そばにいてください。その人の体を温めてください。暑いときは日差しを遮ってください。その人のエマージェンシーブランケットで体を包んでください。`,
              `助けを呼びに行く場合は、別のランナーにそばにいてもらってください。けが人のゼッケンと、その場所の3つの単語（あなたの携帯電話で「3つの単語を調べる」）を写真に撮り、次のエイドステーションに伝えてください。`,
              `ヘビに咬まれた場合：上の「ヘビに咬まれたら」のとおりに包帯を巻くのを手伝ってください。2本目の包帯が必要なら、あなたの包帯を使ってください。`,
              `その場所が危険でない限り、動かさないでください。`
            ] }
          ] },
          { title: `天候と火災`, blocks: [
            { type: 'p', text: `**寒さ：** 夜の尾根では強風とともに0°C以下になることがあります。寒さを感じる前に、早めに防寒着を着てください。危険なサイン：激しい震え、ろれつが回らない、混乱、ふらつき。風を避け、すべての防寒着とエマージェンシーブランケットを身につけ、助けを呼んでください。` },
            { type: 'p', text: `**暑さ：** 暑いときはペースを落としてください。水だけでなく電解質ドリンクも飲み、のどの渇きに応じて飲んでください。エイドステーションでは氷と水で頭と首を冷やしてください。危険なサイン：頭痛、めまい、嘔吐、混乱。日陰で止まり、体を冷やし、助けを呼んでください。` },
            { type: 'p', text: `**火災：** 火や煙を見たら000に電話してください。火から離れ、最寄りのエイドステーションか道路に向かい、大会スタッフの指示に従ってください。VicEmergencyアプリで火災警報を確認できます。` }
          ] },
          { title: `スタート前の確認`, blocks: [
            { type: 'check', items: [
              `このアプリをホーム画面に追加し、地図をオフライン用に保存する（Homeタブ）。`,
              `携帯電話をフル充電し、TelstraのSIMを入れる。モバイルバッテリーを持つ。`,
              `Emergency+とVicEmergencyのアプリをインストール。`,
              `メディカルチーム 1300 375 352 とレースマネージャーの番号（ゼッケンに記載）を携帯電話に登録。`,
              `Google Translate（Google翻訳）をインストールし、日本語をオフライン用にダウンロード。`,
              `スネークバンデージを、すぐ取り出せるポケットに入れる。`,
              `エントリー時に登録した緊急連絡先と医療情報が正しいか確認。`
            ] },
            { type: 'gear' }
          ] },
          { title: `この画面を見せる`, blocks: [
            { type: 'p', text: `スタッフとメディカルチームは翻訳アプリを使います。説明できないときは、この画面を見せて指さしてください。上の**Show in English**をタップすると、スタッフが読める英語に切り替わります。` }
          ] }
        ]
      }
    },
    zh: {
      lang: 'zh-Hans',
      ui: {
        needHelp: `需要帮助？`, call000: `拨打000`, call000Sub: `救护车、警察或消防。通话免费，只要有信号，任何网络都能拨通。`,
        callMed: `拨打医疗团队`, callMedSub: `医疗团队使用英语。如果你无法说明情况，请拨打000并要求翻译。其他事情请打电话给你的赛事经理，号码印在号码布背面。`,
        whereTitle: `告诉我们你在哪里`, w3wTitle: `你的三个单词`,
        w3wIntro: `点按“查找我的三个单词”。应用会显示你所在3米方格的三个单词（what3words）和GPS数字。用英语读给000或医疗团队。`,
        find3: `查找我的三个单词`, update3: `更新我的三个单词`, finding: `正在定位…（请站在空旷处）`,
        w3wReady: `你在{time}的位置，精确到3米。请按屏幕显示用英语读出这三个单词。`,
        w3wGetting: `正在获取三个单词…如果没有显示，请读出数字。`,
        w3wNoSignal: `没有信号，无法获取三个单词。请改为读出这些数字（你的位置）。接通000的翻译后，可以用中文说这些数字。`,
        w3wStored: `没有信号，这是已保存的三个单词，对应离你最近的赛道点（距你{m}米）。请用英语读出，然后再读出GPS数字。`,
        nums: `GPS数字`, share: `分享我的位置`, send: `发送我的位置`,
        shareHint: `先定位，然后通过短信或WhatsApp发送你的赛道公里数和位置。`,
        shareReady: `已就绪：{km}公里，GPS误差±{acc}米。通过短信或WhatsApp发送你的赛道公里数和位置。`,
        found: `已定位到{km}公里处（GPS误差±{acc}米）。再次点按“{send}”即可发送。`,
        gpsBlocked: `本网站的定位权限已被关闭。请在手机设置中允许定位。`, gpsNone: `尚未获取GPS定位。请在空旷处再试一次。`,
        w3wNoLive: `暂时无法获取三个单词。请改为读出这些数字（你的位置）。接通000的翻译后，可以用中文说这些数字。`,
        w3wStoredNoLive: `暂时无法获取三个单词，这是已保存的三个单词，对应离你最近的赛道点（距你{m}米）。请用英语读出，然后再读出GPS数字。`,
        offBy: `你已偏离赛道{dist}。`, offBack: `沿原路返回，回到你最后看到的赛道标记处。`,
        offLine: `赛道在你的{dir}方向，直线距离{dist}。直线路线可能无法通行。`,
        offFar: `你离{race}赛道有{dist}。请检查顶部选择的比赛是否正确。`,
        dirs: ['北', '东北', '东', '东南', '南', '西南', '西', '西北'],
        located: `已定位：误差约{acc}米。`, poorGps: `GPS误差±{acc}米：请站到空旷处，再点按◎。`, raceStarts: `比赛于{time}开始。`,
        kmOf: `**第{km}公里**（全程{len}公里）`, next: `下一站：**{name}**，还有**{dist}**`, backNext: `回到赛道后，下一站：**{name}**，还有**{dist}**`, cutoff: `关门时间 **{time}**`, atFinish: `已到终点。`,
        etaAt: `按你目前的配速，约**{time}**到达。`, etaOn: `按你目前的配速，约**{time}**到达，正好是关门时间。`, etaBefore: `按你目前的配速，约**{time}**到达，比关门时间早{dur}。`,
        etaLate: `**按你目前的配速，约{time}到达，会超过关门时间。**请与补给站工作人员沟通。`, etaBehind: `**你已远远落后于关门配速。**请与补给站工作人员沟通。`,
        shareFar: `已就绪：你离{race}赛道有{dist}（GPS误差±{acc}米）。请先检查顶部选择的比赛，再发送。`,
        foundFar: `已定位，你离{race}赛道有{dist}（GPS误差±{acc}米）。请先检查顶部选择的比赛，再次点按“{send}”即可发送。`,
        lostTitle: `迷路或退赛`, openMap: `打开地图`, gearTab: `强制装备清单在Gear标签页。`,
        summaryTitle: `紧急情况下`, showEnglish: `Show in English`, backTo: `显示中文`,
        note: `基于GPT100紧急情况卡 v0.5（2026年10月）。同一张卡也会印刷并在报到时发放。`
      },
      help: {
        interp: { title: `危及生命的紧急情况：先拨打000`, text: [
          `000（Triple Zero）免费，只要有信号，任何网络都能拨通。用手机也可以拨打112。危及生命的情况包括：没有呼吸、失去知觉、大量出血、胸痛、被蛇咬伤，或身体极度寒冷或过热且意识混乱。`,
          `英语不好？仍然要拨打000。先说“Ambulance”，再说“Victoria”，然后用英语说“Mandarin”。不要挂断电话，翻译会加入通话，可能需要等一会儿。如果电话没有声音，请最多等待60秒。`
        ] },
        where: { steps: [
          `点按**查找我的三个单词**。应用会显示你所在3米方格的三个单词（what3words）和你的GPS数字。`,
          `按照屏幕显示，用英语准确读出三个单词。如果英语有困难，改为读出GPS数字。接通000的翻译后，可以用中文说这些数字。`,
          `说出你的号码布号码、最后经过的补给站，以及发生了什么。`
        ], notes: [
          `**分享我的位置**会通过短信或WhatsApp发送你的赛道公里数、位置和三个单词，例如发给你的后援或下一个补给站。`,
          `使用Telstra SIM卡拨打000时，手机通常也会自动发送你的位置。请务必说明你在哪里。`,
          `**没有手机信号？** GPS数字仍然可用。如果你没有受伤，请继续前往下一个补给站或有信号的地方再打电话。如果你受伤了，请留在原地，拦住下一位跑者，请他拍下你的号码布和这个屏幕，带到下一个补给站。`,
          `如果本应用无法显示，Emergency+应用也会显示同样的三个单词和数字。`
        ] },
        lost: [
          `**迷路了？** 停下来。回到你最后看到的标记处。打开**Map**标签页并点按◎：应用会显示你离赛道多远、赛道在哪个方向。沿着橙色反光标记和黄色的Grampians Peaks Trail三角标志前进。红色叉号表示走错方向。`,
          `**要退赛？** 请把你的号码布号码告诉补给站工作人员。如果你在其他地方离开赛道，必须打电话给你的赛事经理。如果你不告诉我们，我们会开始搜寻你。`,
          `**受伤了？** 尽量留在赛道上：我们会沿赛道搜寻。注意保暖，并拦住下一位跑者。`
        ],
        summary: [
          ['停下', 'STOP', `确保自身安全。被咬伤后保持静止。`],
          ['拨打', 'CALL', `先拨000，再拨医疗团队 1300 375 352。`],
          ['告知', 'TELL', `这个屏幕上的三个单词、号码布号码、发生了什么。`],
          ['等待', 'STAY', `陪在伤者身边。原地等待救援。`]
        ],
        sections: [
          { title: `被蛇咬伤`, blocks: [
            { type: 'alert', title: `不要移动。保持静止可以减缓毒液扩散。`, steps: [
              `离开蛇几步远。不要试图抓蛇或辨认蛇的种类。`,
              `坐下或躺下。保持静止和冷静。`,
              `先拨打000，再拨打医疗团队电话（上方按钮）。说出你的三个单词。`,
              `用绷带把咬伤处紧紧包扎好。`,
              `然后用第二条绷带从紧挨手指或脚趾的上方开始，向上缠绕整条腿或整只手臂，尽量缠到最高处。要缠得紧，像包扎扭伤的脚踝一样。如果绷带上有长方形图案，拉紧到它们变成正方形为止。只有一条绷带？向其他跑者借一条。`,
              `保持肢体伸直不动。用登山杖或树枝作夹板固定，范围包括咬伤处上下的关节。在医护人员取下之前，不要拆除绷带和夹板。`,
              `不要清洗伤口，不要切开伤口，不要使用止血带。`,
              `原地等待救援人员赶来，不要自己走出去。`
            ], after: [`被蛇咬时可能只像被树枝划了一下。注意寻找两个小伤口，通常在小腿。如果不确定，请按蛇咬伤处理。`] },
            { type: 'p', text: `**如果看到蛇：** 停下，慢慢后退，给它留出空间。蛇想离开。等它离开步道后再走。` }
          ] },
          { title: `其他跑者需要帮助时`, blocks: [
            { type: 'bullets', items: [
              `停下来。先确保自己安全。`,
              `如果危及生命，先拨打000，再拨打医疗团队电话。`,
              `陪在他身边。给他保暖；天气炎热时，为他遮挡阳光。用他的急救毯裹住他。`,
              `如果你要去求助，请确保有另一位跑者留下陪伴。拍下伤者的号码布和所在位置的三个单词（用你的手机“查找我的三个单词”），并告知下一个补给站。`,
              `被蛇咬伤：按照上面“被蛇咬伤”的步骤帮他包扎。如果需要第二条绷带，用你的。`,
              `除非他所在的位置有危险，否则不要移动他。`
            ] }
          ] },
          { title: `天气与火灾`, blocks: [
            { type: 'p', text: `**寒冷：** 夜间山脊可能降到0°C以下，并伴有强风。在感到冷之前就尽早穿上保暖衣物。危险信号：剧烈发抖、说话含糊、意识混乱、步履蹒跚。请找地方避风，穿上所有衣物并裹上急救毯，然后求助。` },
            { type: 'p', text: `**炎热：** 天气炎热时请放慢速度。除了清水，也要喝电解质饮料，口渴就喝。在补给站用冰和水给头部和颈部降温。危险信号：头痛、头晕、呕吐、意识混乱。请在阴凉处停下，降温并求助。` },
            { type: 'p', text: `**火灾：** 如果看到火或烟，请拨打000。远离火源，前往最近的补给站或道路，并听从赛事工作人员的指示。VicEmergency应用会显示火灾警报。` }
          ] },
          { title: `出发前检查`, blocks: [
            { type: 'check', items: [
              `已将本应用添加到主屏幕，并保存离线地图（Home标签页）。`,
              `手机充满电，并装有Telstra SIM卡。携带充电宝。`,
              `已安装Emergency+和VicEmergency应用。`,
              `已将医疗团队 1300 375 352 和赛事经理的号码（印在号码布上）存入手机。`,
              `已安装Google Translate（谷歌翻译），并下载了中文离线包。`,
              `蛇咬伤绷带放在随手可拿的口袋里。`,
              `报名信息中的紧急联系人和医疗信息正确无误。`
            ] },
            { type: 'gear' }
          ] },
          { title: `出示本屏幕`, blocks: [
            { type: 'p', text: `我们的工作人员和医疗团队会使用翻译应用。如果你无法说明情况，请出示本屏幕并指给他们看。点按上方的**Show in English**，工作人员就能阅读。` }
          ] }
        ]
      }
    },
    ru: {
      lang: 'ru',
      ui: {
        needHelp: `Нужна помощь?`, call000: `Позвонить 000`, call000Sub: `Скорая помощь, полиция, пожарные. Бесплатно, в любой сети с сигналом.`,
        callMed: `Позвонить медикам`, callMedSub: `Медицинская бригада говорит по-английски. Не можете объяснить? Звоните 000 и попросите переводчика. По остальным вопросам звоните менеджеру забега: телефон на обороте стартового номера.`,
        whereTitle: `Сообщите, где вы находитесь`, w3wTitle: `Ваши три слова`,
        w3wIntro: `Нажмите «Найти мои три слова». Приложение покажет три слова (what3words) для квадрата 3 м, где вы стоите, и GPS-координаты. Прочитайте их по-английски оператору 000 или медикам.`,
        find3: `Найти мои три слова`, update3: `Обновить мои три слова`, finding: `Определяем ваше местоположение… (встаньте на открытое место)`,
        w3wReady: `Ваше место в {time}, точность 3 м. Прочитайте эти три слова по-английски, как они показаны.`,
        w3wGetting: `Получаем три слова… Если они не появятся, прочитайте цифры.`,
        w3wNoSignal: `Нет сигнала для трёх слов. Прочитайте вместо них эти цифры: ваши координаты. С переводчиком 000 цифры можно назвать по-русски.`,
        w3wStored: `Нет сигнала, поэтому показаны сохранённые три слова ближайшей точки трассы, в {m} м от вас. Прочитайте их по-английски, а затем и GPS-координаты.`,
        nums: `GPS-координаты`, share: `Поделиться местоположением`, send: `Отправить местоположение`,
        shareHint: `Сначала определяет ваше положение, затем отправляет километр трассы и координаты по SMS или WhatsApp.`,
        shareReady: `Готово: км {km}, GPS ±{acc} м. Отправляет километр трассы и координаты по SMS или WhatsApp.`,
        found: `Вы на км {km} (GPS ±{acc} м). Нажмите «{send}» ещё раз, чтобы отправить.`,
        gpsBlocked: `Доступ к геолокации для этого сайта закрыт. Разрешите геолокацию в настройках телефона.`, gpsNone: `GPS пока не определил положение. Попробуйте ещё раз на открытом месте.`,
        w3wNoLive: `Три слова сейчас недоступны. Прочитайте вместо них эти цифры: ваши координаты. С переводчиком 000 цифры можно назвать по-русски.`,
        w3wStoredNoLive: `Три слова сейчас недоступны, поэтому показаны сохранённые три слова ближайшей точки трассы, в {m} м от вас. Прочитайте их по-английски, а затем и GPS-координаты.`,
        offBy: `Вы в {dist} от трассы.`, offBack: `Вернитесь тем же путём к последней увиденной метке трассы.`,
        offLine: `До трассы по прямой: {dist}, направление: {dir}. По прямой пройти может быть нельзя.`,
        offFar: `Вы в {dist} от трассы {race}. Проверьте забег, выбранный вверху.`,
        dirs: ['север', 'северо-восток', 'восток', 'юго-восток', 'юг', 'юго-запад', 'запад', 'северо-запад'],
        located: `Местоположение найдено: точность около {acc} м.`, poorGps: `Точность GPS только ±{acc} м: выйдите на открытое место и снова нажмите ◎.`, raceStarts: `Старт {time}.`,
        kmOf: `**Км {km}** из {len}`, next: `Далее: **{name}** через **{dist}**`, backNext: `Вернувшись на трассу, далее: **{name}** через **{dist}**`, cutoff: `лимит **{time}**`, atFinish: `Вы на финише.`,
        etaAt: `В вашем темпе примерно в **{time}**.`, etaOn: `В вашем темпе примерно в **{time}**, ровно к лимиту.`, etaBefore: `В вашем темпе примерно в **{time}**, за {dur} до лимита.`,
        etaLate: `**В вашем темпе примерно в {time}, после лимита.** Поговорите с командой пункта питания.`, etaBehind: `**Вы сильно отстаёте от темпа лимитов.** Поговорите с командой пункта питания.`,
        shareFar: `Готово: вы в {dist} от трассы {race} (GPS ±{acc} м). Проверьте забег, выбранный вверху, затем отправьте.`,
        foundFar: `Местоположение найдено: вы в {dist} от трассы {race} (GPS ±{acc} м). Проверьте забег, выбранный вверху, затем нажмите «{send}» ещё раз, чтобы отправить.`,
        lostTitle: `Заблудились или сходите с дистанции`, openMap: `Открыть карту`, gearTab: `Обязательное снаряжение: вкладка Gear.`,
        summaryTitle: `В экстренной ситуации`, showEnglish: `Show in English`, backTo: `Показать по-русски`,
        note: `По карточке GPT100 Emergency Card v0.5 (октябрь 2026). Та же карточка печатается и выдаётся при регистрации.`
      },
      help: {
        interp: { title: `Угроза жизни: сначала звоните 000`, text: [
          `000 (Triple Zero): бесплатно, в любой сети с сигналом. С мобильного также работает 112. Угроза жизни: не дышит, без сознания, сильное кровотечение, боль в груди, укус змеи, сильное переохлаждение или перегрев со спутанностью сознания.`,
          `Плохо говорите по-английски? Всё равно звоните 000. Скажите «Ambulance», затем «Victoria», затем «Russian». Не кладите трубку: подключится переводчик, это может занять минуту. Если в трубке тишина, ждите до 60 секунд.`
        ] },
        where: { steps: [
          `Нажмите **Найти мои три слова**. Приложение покажет три слова (what3words) для квадрата 3 м, где вы стоите, и ваши GPS-координаты.`,
          `Прочитайте три слова по-английски, как они показаны. Трудно по-английски? Прочитайте GPS-координаты (цифры): с переводчиком 000 цифры можно назвать по-русски.`,
          `Назовите свой стартовый номер, последний пройденный пункт питания и что случилось.`
        ], notes: [
          `**Поделиться местоположением** отправляет километр трассы, координаты и три слова по SMS или WhatsApp, например вашей группе поддержки или на следующий пункт питания.`,
          `С SIM-картой Telstra звонок на 000 обычно сам передаёт ваше местоположение. Всё равно назовите его.`,
          `**Нет сигнала?** GPS-координаты работают и без сигнала. Нет травмы: идите до следующего пункта питания или места с сигналом и звоните оттуда. Есть травма: оставайтесь на месте, остановите следующего бегуна. Пусть он сфотографирует ваш стартовый номер и этот экран и отнесёт снимки на следующий пункт питания.`,
          `Если это приложение не может их показать, те же три слова и координаты есть в приложении Emergency+.`
        ] },
        lost: [
          `**Заблудились?** Остановитесь. Вернитесь к последней увиденной метке. Откройте вкладку **Map** и нажмите ◎: приложение покажет, как далеко вы от трассы и в какой она стороне. Следуйте оранжевым светоотражающим меткам и жёлтым треугольникам Grampians Peaks Trail. Красный крест: неверное направление.`,
          `**Сходите с дистанции?** Сообщите стартовый номер на пункте питания. Сходите в другом месте? Обязательно позвоните менеджеру забега, иначе мы начнём поиски.`,
          `**Травма?** По возможности оставайтесь на трассе: именно там мы будем вас искать. Не замерзайте и остановите следующего бегуна.`
        ],
        summary: [
          ['СТОП', 'STOP', `Убедитесь, что вы в безопасности. При укусе не двигайтесь.`],
          ['ЗВОНИТЕ', 'CALL', `Сначала 000, затем медицинской бригаде 1300 375 352.`],
          ['СООБЩИТЕ', 'TELL', `Три слова с этого экрана, стартовый номер, что случилось.`],
          ['ЖДИТЕ', 'STAY', `Оставайтесь с пострадавшим. Ждите помощи на месте.`]
        ],
        sections: [
          { title: `Укус змеи`, blocks: [
            { type: 'alert', title: `НЕ ДВИГАЙТЕСЬ. НЕПОДВИЖНОСТЬ ЗАМЕДЛЯЕТ РАСПРОСТРАНЕНИЕ ЯДА.`, steps: [
              `Отойдите от змеи на несколько шагов. Не пытайтесь её поймать или определить вид.`,
              `Сядьте или лягте. Сохраняйте неподвижность и спокойствие.`,
              `Позвоните 000, затем медицинской бригаде (кнопки вверху). Назовите свои три слова.`,
              `Туго наложите бинт прямо на место укуса.`,
              `Затем наложите второй бинт: начиная чуть выше пальцев руки или ноги, бинтуйте вверх по всей руке или ноге, насколько хватит. Туго, как при растяжении голеностопа. Если на бинте есть прямоугольники, натягивайте его, пока они не станут квадратами. Только один бинт? Попросите бинт у другого бегуна.`,
              `Держите конечность прямо и неподвижно. Наложите шину из трекинговой палки или ветки, захватив суставы выше и ниже укуса. Не снимайте бинты и шину, пока их не снимут медики.`,
              `Не промывайте место укуса. Не делайте надрезов. Не накладывайте жгут.`,
              `Ждите, пока помощь придёт к вам. Никуда не идите.`
            ], after: [`Укус может ощущаться как царапина от ветки. Ищите две маленькие ранки, чаще на голени. Не уверены? Действуйте как при укусе.`] },
            { type: 'p', text: `**Если видите змею:** остановитесь, медленно отойдите назад и подождите, пока змея уползёт с тропы.` }
          ] },
          { title: `Если помощь нужна другому бегуну`, blocks: [
            { type: 'bullets', items: [
              `Остановитесь. Сначала убедитесь, что вы в безопасности.`,
              `При угрозе жизни звоните 000, затем медицинской бригаде.`,
              `Оставайтесь с пострадавшим. Согревайте его, в жару защитите от солнца. Укройте пострадавшего его же спасательным одеялом.`,
              `Идёте за помощью? Пусть с пострадавшим останется другой бегун. Сфотографируйте стартовый номер пострадавшего и три слова этого места («Найти мои три слова» на вашем телефоне) и сообщите на следующий пункт питания.`,
              `Укус змеи: помогите наложить бинты, как описано выше в разделе «Укус змеи». Если нужен второй бинт, дайте свой.`,
              `Не перемещайте пострадавшего, если на месте ему ничего не угрожает.`
            ] }
          ] },
          { title: `Погода и пожар`, blocks: [
            { type: 'p', text: `**Холод.** Ночью на хребтах бывает ниже 0°C и сильный ветер. Утепляйтесь заранее, пока не замёрзли. Тревожные признаки: сильная дрожь, невнятная речь, спутанность сознания, шаткая походка. Укройтесь от ветра, наденьте все слои, укутайтесь в спасательное одеяло, вызовите помощь.` },
            { type: 'p', text: `**Жара.** В жару снизьте темп. Пейте электролиты, а не только воду, по жажде. На пунктах питания охлаждайте голову и шею льдом и водой. Тревожные признаки: головная боль, головокружение, рвота, спутанность сознания. В тени охладитесь и вызовите помощь.` },
            { type: 'p', text: `**Пожар.** Видите огонь или дым? Звоните 000. Уходите от огня к ближайшему пункту питания или дороге и выполняйте указания организаторов. VicEmergency показывает предупреждения о пожарах.` }
          ] },
          { title: `Перед стартом`, blocks: [
            { type: 'check', items: [
              `Это приложение добавлено на главный экран, карта сохранена офлайн (вкладка Home).`,
              `Телефон заряжен, SIM-карта Telstra, пауэрбанк.`,
              `Установлены Emergency+ и VicEmergency.`,
              `Номер медицинской бригады 1300 375 352 и телефон менеджера забега (на стартовом номере) сохранены в телефоне.`,
              `Google Translate: русский язык загружен офлайн.`,
              `Бинт от укуса змеи под рукой.`,
              `Экстренный контакт и медданные в регистрации верны.`
            ] },
            { type: 'gear' }
          ] },
          { title: `Покажите этот экран`, blocks: [
            { type: 'p', text: `Команда и медики пользуются переводчиками в телефоне. Не можете объяснить? Покажите этот экран и укажите нужный пункт. Нажмите **Show in English** вверху, чтобы они могли прочитать.` }
          ] }
        ]
      }
    },
    pl: {
      lang: 'pl',
      ui: {
        needHelp: `Potrzebujesz pomocy?`, call000: `Zadzwoń pod 000`, call000Sub: `Karetka, policja, straż pożarna. Bezpłatnie, w każdej sieci z zasięgiem.`,
        callMed: `Zadzwoń do zespołu medycznego`, callMedSub: `Zespół medyczny mówi po angielsku. Nie możesz się porozumieć? Dzwoń pod 000 i poproś o tłumacza. W innych sprawach dzwoń do kierownika biegu: numer na odwrocie numeru startowego.`,
        whereTitle: `Powiedz nam, gdzie jesteś`, w3wTitle: `Twoje trzy słowa`,
        w3wIntro: `Stuknij „Znajdź moje trzy słowa”. Aplikacja pokaże trzy słowa (what3words) dla kwadratu 3 m, w którym stoisz, i współrzędne GPS. Przeczytaj je po angielsku operatorowi 000 lub zespołowi medycznemu.`,
        find3: `Znajdź moje trzy słowa`, update3: `Odśwież moje trzy słowa`, finding: `Ustalam twoją pozycję… (stań w otwartym miejscu)`,
        w3wReady: `Twoja pozycja o {time}, z dokładnością do 3 m. Przeczytaj te trzy słowa po angielsku, dokładnie tak, jak są wyświetlone.`,
        w3wGetting: `Pobieram trzy słowa… Jeśli się nie pojawią, przeczytaj liczby.`,
        w3wNoSignal: `Brak zasięgu, nie można pobrać trzech słów. Zamiast nich przeczytaj te liczby: to twoja pozycja. Gdy dołączy tłumacz 000, liczby możesz podać po polsku.`,
        w3wStored: `Brak zasięgu, więc to zapisane trzy słowa najbliższego punktu trasy, {m} m od ciebie. Przeczytaj je po angielsku, a potem także współrzędne GPS.`,
        nums: `Współrzędne GPS`, share: `Udostępnij moją lokalizację`, send: `Wyślij moją lokalizację`,
        shareHint: `Najpierw ustala twoją pozycję, potem wysyła kilometr trasy i pozycję SMS-em lub przez WhatsApp.`,
        shareReady: `Gotowe: km {km}, GPS ±{acc} m. Wysyła kilometr trasy i pozycję SMS-em lub przez WhatsApp.`,
        found: `Jesteś na km {km} (GPS ±{acc} m). Stuknij „{send}” jeszcze raz, aby wysłać.`,
        gpsBlocked: `Lokalizacja dla tej strony jest zablokowana. Zezwól na lokalizację w ustawieniach telefonu.`, gpsNone: `Brak sygnału GPS. Spróbuj ponownie w otwartym miejscu.`,
        w3wNoLive: `Trzy słowa są teraz niedostępne. Zamiast nich przeczytaj te liczby: to twoja pozycja. Gdy dołączy tłumacz 000, liczby możesz podać po polsku.`,
        w3wStoredNoLive: `Trzy słowa są teraz niedostępne, więc to zapisane trzy słowa najbliższego punktu trasy, {m} m od ciebie. Przeczytaj je po angielsku, a potem także współrzędne GPS.`,
        offBy: `Jesteś {dist} od trasy.`, offBack: `Wróć tą samą drogą do ostatniego widzianego oznaczenia trasy.`,
        offLine: `Do trasy w linii prostej: {dist}, kierunek: {dir}. W linii prostej może nie dać się przejść.`,
        offFar: `Jesteś {dist} od trasy {race}. Sprawdź bieg wybrany na górze.`,
        dirs: ['północ', 'północny wschód', 'wschód', 'południowy wschód', 'południe', 'południowy zachód', 'zachód', 'północny zachód'],
        located: `Znaleziono cię: dokładność około {acc} m.`, poorGps: `GPS tylko ±{acc} m: stań w otwartym miejscu i stuknij ◎ ponownie.`, raceStarts: `Start {time}.`,
        kmOf: `**Km {km}** z {len}`, next: `Dalej: **{name}** za **{dist}**`, backNext: `Po powrocie na trasę dalej: **{name}** za **{dist}**`, cutoff: `limit czasu **{time}**`, atFinish: `Jesteś na mecie.`,
        etaAt: `W twoim tempie około **{time}**.`, etaOn: `W twoim tempie około **{time}**, dokładnie na limit czasu.`, etaBefore: `W twoim tempie około **{time}**, {dur} przed limitem czasu.`,
        etaLate: `**W twoim tempie około {time}, po limicie czasu.** Porozmawiaj z obsługą punktu odżywczego.`, etaBehind: `**Jesteś daleko za tempem limitów czasu.** Porozmawiaj z obsługą punktu odżywczego.`,
        shareFar: `Gotowe: jesteś {dist} od trasy {race} (GPS ±{acc} m). Sprawdź bieg wybrany na górze, potem wyślij.`,
        foundFar: `Znaleziono cię {dist} od trasy {race} (GPS ±{acc} m). Sprawdź bieg wybrany na górze, potem stuknij „{send}” jeszcze raz, aby wysłać.`,
        lostTitle: `Zgubiony szlak lub zejście z trasy`, openMap: `Otwórz mapę`, gearTab: `Sprzęt obowiązkowy jest w zakładce Gear.`,
        summaryTitle: `W nagłej sytuacji`, showEnglish: `Show in English`, backTo: `Pokaż po polsku`,
        note: `Na podstawie karty GPT100 Emergency Card v0.5 (październik 2026). Ta sama karta jest drukowana i rozdawana przy rejestracji.`
      },
      help: {
        interp: { title: `Zagrożenie życia: najpierw dzwoń pod 000`, text: [
          `000 (Triple Zero) jest bezpłatne i działa w każdej sieci z zasięgiem. Z telefonu komórkowego działa też 112. Zagrożenie życia to: brak oddechu, utrata przytomności, silne krwawienie, ból w klatce piersiowej, ukąszenie węża, silne wychłodzenie lub przegrzanie z dezorientacją.`,
          `Słabo mówisz po angielsku? I tak dzwoń pod 000. Powiedz „Ambulance”, potem „Victoria”, potem po angielsku „Polish”. Nie rozłączaj się. Dołączy tłumacz. Może to potrwać minutę. Jeśli w słuchawce jest cisza, czekaj do 60 sekund.`
        ] },
        where: { steps: [
          `Stuknij **Znajdź moje trzy słowa**. Aplikacja pokaże trzy słowa (what3words) dla kwadratu 3 m, w którym stoisz, i twoje współrzędne GPS.`,
          `Przeczytaj trzy słowa po angielsku, dokładnie tak, jak są wyświetlone. Angielski jest trudny? Podaj współrzędne GPS (liczby): gdy dołączy tłumacz 000, liczby możesz podać po polsku.`,
          `Podaj swój numer startowy, ostatni minięty punkt odżywczy i co się stało.`
        ], notes: [
          `**Udostępnij moją lokalizację** wysyła kilometr trasy, pozycję i trzy słowa SMS-em lub przez WhatsApp, na przykład do twojego supportu lub na następny punkt odżywczy.`,
          `Z kartą SIM Telstra połączenie z 000 zwykle przesyła też lokalizację telefonu. Zawsze powiedz, gdzie jesteś.`,
          `**Brak zasięgu?** Współrzędne GPS działają też bez zasięgu. Bez urazu: idź dalej do następnego punktu odżywczego lub miejsca z zasięgiem i zadzwoń stamtąd. Masz uraz: zostań na miejscu i zatrzymaj następnego biegacza. Niech sfotografuje twój numer startowy i ten ekran i zaniesie zdjęcia do następnego punktu odżywczego.`,
          `Jeśli ta aplikacja nie może ich pokazać, te same trzy słowa i współrzędne pokazuje aplikacja Emergency+.`
        ] },
        lost: [
          `**Zgubiony szlak?** Zatrzymaj się. Wróć do ostatniego widzianego oznaczenia. Otwórz zakładkę **Map** i stuknij ◎: aplikacja pokaże, jak daleko jesteś od trasy i w którą stronę iść. Kieruj się pomarańczowymi oznaczeniami odblaskowymi i żółtymi trójkątami Grampians Peaks Trail. Czerwony krzyżyk oznacza złą drogę.`,
          `**Schodzisz z trasy?** Podaj swój numer startowy obsłudze punktu odżywczego. Jeśli opuszczasz trasę w innym miejscu, musisz zadzwonić do kierownika biegu. Jeśli nam nie powiesz, rozpoczniemy poszukiwania.`,
          `**Masz uraz?** Jeśli możesz, zostań na trasie: tam będziemy cię szukać. Nie wychładzaj się i zatrzymaj następnego biegacza.`
        ],
        summary: [
          ['STÓJ', 'STOP', `Zadbaj o swoje bezpieczeństwo. Po ukąszeniu nie ruszaj się.`],
          ['DZWOŃ', 'CALL', `Najpierw 000, potem zespół medyczny 1300 375 352.`],
          ['POWIEDZ', 'TELL', `Trzy słowa z tego ekranu, numer startowy, co się stało.`],
          ['ZOSTAŃ', 'STAY', `Zostań z poszkodowanym. Czekaj na pomoc na miejscu.`]
        ],
        sections: [
          { title: `Ukąszenie węża`, blocks: [
            { type: 'alert', title: `NIE RUSZAJ SIĘ. BEZRUCH SPOWALNIA ROZPRZESTRZENIANIE SIĘ JADU.`, steps: [
              `Odejdź kilka kroków od węża. Nie próbuj go łapać ani rozpoznawać.`,
              `Usiądź lub połóż się. Zachowaj spokój i bezruch.`,
              `Zadzwoń pod 000, potem do zespołu medycznego (przyciski u góry). Podaj swoje trzy słowa.`,
              `Załóż mocny bandaż na miejsce ukąszenia.`,
              `Potem drugim bandażem owiń całą nogę lub rękę, zaczynając tuż nad palcami dłoni lub stopy, jak najwyżej. Mocno i ciasno, jak przy skręconej kostce. Prostokąty na bandażu? Naciągaj, aż staną się kwadratami. Masz tylko jeden bandaż? Poproś innego biegacza o jego bandaż.`,
              `Trzymaj kończynę prosto i nieruchomo. Unieruchom ją szyną (kijkiem trekkingowym lub gałęzią), obejmując stawy powyżej i poniżej ukąszenia. Nie zdejmuj bandaży ani szyny, dopóki nie zdejmie ich personel medyczny.`,
              `Nie myj miejsca ukąszenia. Nie nacinaj go. Nie zakładaj opaski uciskowej (stazy).`,
              `Czekaj, aż pomoc dotrze do ciebie. Nigdzie nie idź.`
            ], after: [`Ukąszenie można odczuć jak zadrapanie gałązką. Szukaj dwóch małych ranek, często na podudziu. Jeśli nie masz pewności, postępuj jak przy ukąszeniu.`] },
            { type: 'p', text: `**Jeśli widzisz węża:** zatrzymaj się, powoli się cofnij i zostaw mu miejsce. Wąż chce odejść. Poczekaj, aż zejdzie ze szlaku.` }
          ] },
          { title: `Gdy inny biegacz potrzebuje pomocy`, blocks: [
            { type: 'bullets', items: [
              `Zatrzymaj się. Najpierw zadbaj o własne bezpieczeństwo.`,
              `Przy zagrożeniu życia dzwoń pod 000, potem do zespołu medycznego.`,
              `Zostań z poszkodowanym. Ogrzewaj go, a w upale osłoń go przed słońcem. Owiń poszkodowanego jego kocem ratunkowym.`,
              `Idziesz po pomoc? Niech inny biegacz zostanie z poszkodowanym. Sfotografuj numer startowy poszkodowanego i trzy słowa tego miejsca („Znajdź moje trzy słowa” na twoim telefonie) i powiadom następny punkt odżywczy.`,
              `Ukąszenie węża: pomóż założyć bandaże jak w sekcji „Ukąszenie węża” powyżej. Jeśli potrzebny jest drugi bandaż, daj swój.`,
              `Nie przemieszczaj poszkodowanego, chyba że na miejscu grozi mu niebezpieczeństwo.`
            ] }
          ] },
          { title: `Pogoda i pożar`, blocks: [
            { type: 'p', text: `**Zimno.** W nocy na grzbietach bywa poniżej 0°C i wieje silny wiatr. Załóż ciepłe warstwy, zanim zmarzniesz. Objawy ostrzegawcze: silne dreszcze, bełkotliwa mowa, dezorientacja, potykanie się. Schroń się przed wiatrem, załóż wszystkie warstwy, owiń się kocem ratunkowym (folią NRC) i wezwij pomoc.` },
            { type: 'p', text: `**Upał.** W upale zwolnij. Pij elektrolity, nie tylko wodę, i pij, gdy czujesz pragnienie. Na punktach odżywczych chłodź głowę i kark lodem i wodą. Objawy ostrzegawcze: ból głowy, zawroty głowy, wymioty, dezorientacja. Zatrzymaj się w cieniu, schłodź się i wezwij pomoc.` },
            { type: 'p', text: `**Pożar.** Widzisz ogień lub dym? Dzwoń pod 000. Oddal się od ognia w stronę najbliższego punktu odżywczego lub drogi i stosuj się do poleceń obsługi zawodów. VicEmergency pokazuje ostrzeżenia pożarowe.` }
          ] },
          { title: `Przed startem`, blocks: [
            { type: 'check', items: [
              `Ta aplikacja dodana do ekranu głównego, mapa zapisana offline (zakładka Home).`,
              `Telefon naładowany, karta SIM Telstra, powerbank.`,
              `Zainstalowane Emergency+ i VicEmergency.`,
              `Numer zespołu medycznego 1300 375 352 i numer kierownika biegu (na numerze startowym) zapisane w telefonie.`,
              `Google Translate z językiem polskim offline.`,
              `Bandaż na ukąszenie węża pod ręką.`,
              `Poprawny kontakt alarmowy i dane medyczne w rejestracji.`
            ] },
            { type: 'gear' }
          ] },
          { title: `Pokaż ten ekran`, blocks: [
            { type: 'p', text: `Obsługa i zespół medyczny korzystają z aplikacji do tłumaczenia. Nie możesz wyjaśnić? Pokaż ten ekran i wskaż odpowiedni fragment. Stuknij **Show in English** u góry, aby mogli go przeczytać.` }
          ] }
        ]
      }
    }
  }
};
