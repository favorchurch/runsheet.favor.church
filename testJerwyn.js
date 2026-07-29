async function test() {
    const url = `https://rock.favor.church/api/GroupMembers?$filter=PersonId eq 4185 and GroupMemberStatus eq '1'&$select=Id,GroupId,GroupRoleId,GroupTypeId,GroupMemberStatus&$top=500`;
    const res = await fetch(url, {
        headers: { 'Authorization-Token': process.env.ROCK_API_KEY }
    });
    console.log(await res.json());
}
test();
