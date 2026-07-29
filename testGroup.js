async function test() {
    const url = `https://rock.favor.church/api/Groups/23`;
    const res = await fetch(url, {
        headers: { 'Authorization-Token': process.env.ROCK_API_KEY }
    });
    console.log(`Group 23: ${res.status}`);
    if (!res.ok) console.log(await res.text());
    else console.log(await res.json());
}
test();
