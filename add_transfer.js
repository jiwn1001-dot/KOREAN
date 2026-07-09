const fs = require('fs');
let code = fs.readFileSync('src/lib/gameLogic.js', 'utf8');

const func = `
export async function transferItems(fromCountryId, toCountryId, itemType, itemKey, amount) {
  if (amount <= 0) return { success: false, message: '수량은 1 이상이어야 합니다.' };
  
  if (itemType === 'resource' || itemType === 'weapon') {
    let query = supabase.from('resources').select('*').eq('country_id', fromCountryId);
    if (itemType === 'weapon') query = query.eq('resource_type', 'weapon').eq('name', itemKey);
    else query = query.eq('resource_type', itemKey);
    const { data: senderRes } = await query.single();
    
    if (!senderRes || senderRes.amount < amount) {
      return { success: false, message: '보낼 물자가 부족합니다.' };
    }
    
    await supabase.from('resources').update({ amount: senderRes.amount - amount }).eq('id', senderRes.id);
    
    let rQuery = supabase.from('resources').select('*').eq('country_id', toCountryId);
    if (itemType === 'weapon') rQuery = rQuery.eq('resource_type', 'weapon').eq('name', itemKey);
    else rQuery = rQuery.eq('resource_type', itemKey);
    const { data: receiverRes } = await rQuery.single();
    
    if (receiverRes) {
      await supabase.from('resources').update({ amount: receiverRes.amount + amount }).eq('id', receiverRes.id);
    } else {
      await supabase.from('resources').insert({
        country_id: toCountryId,
        resource_type: itemType === 'weapon' ? 'weapon' : itemKey,
        amount: amount,
        production_per_turn: 0,
        name: itemType === 'weapon' ? itemKey : null
      });
    }
  } else if (itemType === 'coin') {
    const { data: senderData } = await supabase.from('data_entries').select('*').eq('category', 'country_stats').eq('country_id', fromCountryId).single();
    if (!senderData || !senderData.data[itemKey] || senderData.data[itemKey] < amount) {
      return { success: false, message: '보낼 코인이 부족합니다.' };
    }
    
    const { data: receiverData } = await supabase.from('data_entries').select('*').eq('category', 'country_stats').eq('country_id', toCountryId).single();
    if (!receiverData) return { success: false, message: '수신국 데이터를 찾을 수 없습니다.' };
    
    senderData.data[itemKey] -= amount;
    receiverData.data[itemKey] = (receiverData.data[itemKey] || 0) + amount;
    
    await supabase.from('data_entries').update({ data: senderData.data }).eq('id', senderData.id);
    await supabase.from('data_entries').update({ data: receiverData.data }).eq('id', receiverData.id);
  }
  
  return { success: true, message: '성공적으로 전송되었습니다.' };
}
`;

if (!code.includes('transferItems')) {
  fs.writeFileSync('src/lib/gameLogic.js', code + '\n' + func, 'utf8');
  console.log('transferItems added');
} else {
  console.log('already exists');
}
