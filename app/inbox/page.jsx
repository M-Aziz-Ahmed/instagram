import ChatBox from "@/components/Inbox/ChatBox";

const page = () => {
    return (
        <div className="flex">
            <div className="w-50"></div>
            <div className="">
                <ChatBox/>
            </div>
        </div>
    );
}

export default page;