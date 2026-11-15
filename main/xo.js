const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    REST,
    Routes,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

// ตัวแปรสถานะของเกม
let player1 = null;
let player2 = null;
let turn = null;
let gameOver = true;
let board = [];
let count = 0;

const winningConditions = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
];

// ฟังก์ชันเช็กผู้ชนะ
function checkWinner(winningConditions, mark) {
    for (const condition of winningConditions) {
        if (
            board[condition[0]] === mark &&
            board[condition[1]] === mark &&
            board[condition[2]] === mark
        ) {
            gameOver = true;
            return true;
        }
    }
    return false;
}

module.exports = (client) => {
    console.log("🎮 โหลดโมดูลเกม XO สำเร็จ!");

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const args = message.content.trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // คำสั่ง !xohelp
        if (command === '!xohelp') {
            return message.channel.send("เริ่มเล่น xo โดยการ !xo @ผู้เล่นที่1 @ผู้เล่นที่2 เล่นให้จบ นะค่ะเดะมันรก จอ❤️");
        }

        // คำสั่ง !xostop
        if (command === '!xostop') {
            if (!gameOver) {
                if (message.author.id === player1?.id || message.author.id === player2?.id) {
                    gameOver = true;
                    return message.channel.send("เกมถูกหยุดแล้ว!");
                } else {
                    return message.channel.send("คุณไม่มีสิทธิ์หยุดเกมนี้!");
                }
            } else {
                return message.channel.send("ไม่มีเกมที่กำลังเล่นอยู่!");
            }
        }

        // คำสั่ง !xo @p1 @p2
        if (command === '!xo') {
            const p1 = message.mentions.members.at(0);
            const p2 = message.mentions.members.at(1);

            if (!p1 || !p2) {
                return message.channel.send("แท็กคุณและอีกคนเพื่อเริ่ม (เช่น !xo @p1 @p2)");
            }

            if (gameOver) {
                board = [
                    ":white_large_square:", ":white_large_square:", ":white_large_square:",
                    ":white_large_square:", ":white_large_square:", ":white_large_square:",
                    ":white_large_square:", ":white_large_square:", ":white_large_square:"
                ];
                turn = null;
                gameOver = false;
                count = 0;

                player1 = p1;
                player2 = p2;

                // พิมพ์กระดาน
                let line = "";
                for (let x = 0; x < board.length; x++) {
                    line += " " + board[x];
                    if (x === 2 || x === 5 || x === 8) {
                        await message.channel.send(line);
                        line = "";
                    }
                }

                // สุ่มคนเริ่มก่อน
                const num = Math.floor(Math.random() * 2) + 1;
                if (num === 1) {
                    turn = player1;
                    await message.channel.send(`ตาของ <@${player1.id}>`);
                } else {
                    turn = player2;
                    await message.channel.send(`ตาของ <@${player2.id}>`);
                }
            } else {
                await message.channel.send("เกมเริ่มแล้ว เล่นให้จบก่อนเริ่มเกมใหม่นะ");
            }
        }

        // คำสั่ง !วาง [1-9]
        if (command === '!วาง') {
            const pos = parseInt(args[0]);

            if (isNaN(pos)) {
                return message.channel.send("โปรดเลือกจุดที่จะลงเป็นตัวเลข 1-9 (เช่น !วาง 1)");
            }

            if (!gameOver) {
                let mark = "";
                let endg = "";

                if (message.author.id === turn?.id) {
                    if (turn.id === player1.id) {
                        mark = ":regional_indicator_x:";
                        endg = `<@${player1.id}>`;
                    } else if (turn.id === player2.id) {
                        mark = ":o2:";
                        endg = `<@${player2.id}>`;
                    }

                    if (pos > 0 && pos < 10 && board[pos - 1] === ":white_large_square:") {
                        board[pos - 1] = mark;
                        count++;

                        // พิมพ์กระดานอัปเดต
                        let line = "";
                        for (let x = 0; x < board.length; x++) {
                            line += " " + board[x];
                            if (x === 2 || x === 5 || x === 8) {
                                await message.channel.send(line);
                                line = "";
                            }
                        }

                        const hasWon = checkWinner(winningConditions, mark);

                        if (hasWon) {
                            await message.channel.send(endg + " ชนะ!");
                        } else if (count >= 9) {
                            gameOver = true;
                            await message.channel.send("เสมอ");
                        }

                        // สลับตาเดิน
                        if (!gameOver) {
                            if (turn.id === player1.id) {
                                turn = player2;
                            } else {
                                turn = player1;
                            }
                        }
                    } else {
                        await message.channel.send("โปรดเลือก 1-9 และช่องนั้นต้องว่างอยู่");
                    }
                } else {
                    await message.channel.send(`<@${message.author.id}> ไม่ใช่ตาของคุณ`);
                }
            } else {
                await message.channel.send("โปรดเริ่มเกมใหม่ด้วย !xo @p1 @p2");
            }
        }
    });
};
