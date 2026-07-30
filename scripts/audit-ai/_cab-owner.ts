import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async()=>{
  const{data,error}=await sb.from("audits").select("id,user_id,audit_source,status,bid_recommendation").eq("id","cab687da-11a4-4b6e-8820-20516f293a1c").single();
  if(error){console.log("ERR",error.message);return;}
  console.log(JSON.stringify(data,null,1));
  if(data?.user_id){const{data:u}=await sb.auth.admin.getUserById(data.user_id);console.log("owner email:", u?.user?.email);}
})();
