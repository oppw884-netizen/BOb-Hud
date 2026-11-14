const {
	ContainerBuilder,
	ButtonStyle,
	MessageFlags,
	StringSelectMenuBuilder,
	Events,
} = require('discord.js');
const axios = require('axios');

const THB_RATE = 0.15;
const MAX_ASSET_TEXT = 1500; // กันข้อความยาวเกินลิมิตของ Components V2
const HTTP_OPTIONS = { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } };

module.exports = function registerRoblox(client) {
	let searchHistory = [];

	client.on(Events.MessageCreate, async (message) => {
		if (message.author.bot || !message.content.startsWith('!roblox')) return;

		const args = message.content.trim().split(/\s+/);
		if (args[0] !== '!roblox') return;
		const username = args[1];

		if (!username) {
			await message.reply('ใช้แบบนี้: `!roblox <ชื่อผู้ใช้>`').catch(() => {});
			return;
		}

		const loadingContainer = new ContainerBuilder()
			.setAccentColor(0x00FFFF)
			.addTextDisplayComponents((t) => t.setContent('ระบบ: กำลังรวบรวมข้อมูลและเรนเดอร์อินเตอร์เฟซ V2 ทั้งหมดในไฟล์เดียว...'));

		const loadingMsg = await message.channel.send({
			components: [loadingContainer],
			flags: MessageFlags.IsComponentsV2
		});

		try {
			const userRes = await axios.post('https://users.roblox.com/v1/usernames/users', {
				usernames: [username],
				excludeBannedUsers: false
			}, {
				...HTTP_OPTIONS,
				headers: { ...HTTP_OPTIONS.headers, 'Content-Type': 'application/json' }
			});

			if (!userRes.data.data.length) {
				const errorContainer = new ContainerBuilder()
					.setAccentColor(0xFF0000)
					.addTextDisplayComponents((t) => t.setContent('ข้อผิดพลาด: ไม่พบข้อมูลผู้ใช้งานที่ระบุในระบบ Roblox'));
				return await loadingMsg.edit({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
			}

			const user = userRes.data.data[0];
			const userId = user.id;

			if (!searchHistory.some((h) => h.value === userId.toString())) {
				searchHistory.unshift({ label: `ประวัติ: ${user.displayName}`.slice(0, 100), value: userId.toString() });
				if (searchHistory.length > 10) searchHistory.pop();
			}

			const [userInfo, userThumbFull, currentlyWearing, userFriends, userGroups] = await Promise.all([
				axios.get(`https://users.roblox.com/v1/users/${userId}`, HTTP_OPTIONS),
				axios.get(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`, HTTP_OPTIONS),
				axios.get(`https://avatar.roblox.com/v1/users/${userId}/currently-wearing`, HTTP_OPTIONS),
				axios.get(`https://friends.roblox.com/v1/users/${userId}/friends/count`, HTTP_OPTIONS),
				axios.get(`https://groups.roblox.com/v1/users/${userId}/groups/roles`, HTTP_OPTIONS)
			]);

			const assetIds = currentlyWearing.data.assetIds || [];
			let totalRobux = 0;
			let assetList = '';

			if (assetIds.length > 0) {
				const itemDetails = await axios.post('https://catalog.roblox.com/v1/catalog/items/details', {
					items: assetIds.map((id) => ({ itemType: 1, id }))
				}, {
					...HTTP_OPTIONS,
					headers: { ...HTTP_OPTIONS.headers, 'Content-Type': 'application/json' }
				}).catch(() => ({ data: { data: [] } }));

				if (itemDetails.data.data) {
					itemDetails.data.data.forEach((item) => {
						const price = item.price || item.lowestPrice || 0;
						totalRobux += price;
						assetList += `ไอเทม: ${item.name} | ${price} Robux\n`;
					});
				}
			}

			if (assetList.length > MAX_ASSET_TEXT) {
				assetList = assetList.slice(0, MAX_ASSET_TEXT).replace(/\n[^\n]*$/, '') + '\n...(ตัดรายการที่เหลือ)\n';
			}

			const fullBodyUrl = userThumbFull.data.data[0]?.imageUrl || '';
			const thbValue = (totalRobux * THB_RATE).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

			const finalContainer = new ContainerBuilder()
				.setAccentColor(0x00BFFF)
				.addTextDisplayComponents((t) => t.setContent(
					`# 💀 มึงอยากรู้ข้อมูลมันเหรอ\n` +
					`━━━━━━━━━━━━━━━━━━━━\n` +
					`## 👤 ประวัติไอ้ตัวดี\n` +
					`ชื่อเล่น: ${user.displayName}\n` +
					`รหัสผู้ใช้: ${userId}\n` +
					`สถานะ: ${userInfo.data.isBanned ? 'โดนแบนจนได้' : 'ยังไม่โดนเชือด'}\n` +
					`สมัครตั้งแต่: ${new Date(userInfo.data.created).toLocaleString('th-TH')}\n\n` +
					`## 🤡 เพื่อนฝูงของมึง\n` +
					`เพื่อน: ${userFriends.data.count} คน\n` +
					`กลุ่ม: ${userGroups.data.data.length} กลุ่ม\n\n` +
					`## 💸 ทรัพย์สินของไอ้เวร\n` +
					`${assetList || 'ไม่มีอะไรให้โชว์ว่ะ'}\n` +
					`━━━━━━━━━━━━━━━━━━━━\n` +
					`Robux รวม: ${totalRobux.toLocaleString()}\n` +
					`ตีเป็นเงินบาท: ${thbValue} บาท\n\n` +
					`-# พ่องมึงดิ ตรวจเสร็จแล้วไอ้สัส 💀`
				))
				.addSectionComponents((section) =>
					section.addTextDisplayComponents((t) => t.setContent('คลิกเพื่อไปยังหน้าโปรไฟล์หลักของผู้เล่นคนนี้'))
						.setButtonAccessory((btn) =>
							btn.setLabel('เปิดโปรไฟล์').setStyle(ButtonStyle.Link).setURL(`https://www.roblox.com/users/${userId}/profile`)
						)
				);

			// ถ้าไม่มีรูปอวาตาร์ (URL ว่าง) การเพิ่ม Media Gallery จะ error จึงเพิ่มเฉพาะตอนมีรูป
			if (fullBodyUrl) {
				finalContainer.addMediaGalleryComponents((gallery) =>
					gallery.addItems((item) => item.setURL(fullBodyUrl).setDescription('FULL_BODY_AVATAR'))
				);
			}

			finalContainer
				.addSeparatorComponents((s) => s)
				.addActionRowComponents((row) =>
					row.addComponents(
						new StringSelectMenuBuilder()
							.setCustomId('history_v2')
							.setPlaceholder('ประวัติการค้นหาล่าสุดในระบบ')
							.addOptions(searchHistory.length > 0 ? searchHistory : [{ label: 'ไม่มีประวัติ', value: 'none' }])
					)
				);

			await loadingMsg.edit({
				components: [finalContainer],
				flags: MessageFlags.IsComponentsV2
			});

		} catch (error) {
			const errorContainer = new ContainerBuilder()
				.setAccentColor(0xFF0000)
				.addTextDisplayComponents((t) => t.setContent(`ระบบขัดข้องในการรวบรวม UI: ${error.message}`));
			await loadingMsg.edit({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
		}
	});
};
