import discord
from discord.ext import commands

intents = discord.Intents.default()
intents.message_content = True
intents.voice_states = True
bot = commands.Bot(command_prefix="!", intents=intents)


VOICE_CHANNEL_ID =  1567187288323268752 # <-- แก้เป็น ID จริงของคุณ

@bot.event
async def on_ready():
    print(f'บอทออนแล้วไปสัส {bot.user}')

    
    channel = bot.get_channel(VOICE_CHANNEL_ID)
    if isinstance(channel, discord.VoiceChannel):
        await channel.connect()
        print(f"บอทเข้าห้องเสียง: {channel.name}")
    else:
        print("ไม่พบ Voice Channel ตาม ID")
 
    streaming = discord.Streaming(
        name="พ่องมุงตาย",  
        url="https://www.twitch.tv/discord"   
    )
    await bot.change_presence(activity=streaming)


bot.run("DISCORD_TOKEN")
