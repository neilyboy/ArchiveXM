import { Link } from 'react-router-dom'
import { Radio } from 'lucide-react'

function ChannelCard({ channel }) {
  return (
    <Link
      to={`/channel/${channel.channel_id}`}
      className="card hover:border-sxm-accent transition-colors group"
    >
      {/* Channel Image */}
      <div className="aspect-square mb-3 rounded-lg overflow-hidden bg-sxm-darker">
        {channel.image_url ? (
          <img
            src={channel.image_url}
            alt={channel.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'flex'
            }}
            loading="lazy"
          />
        ) : null}
        <div 
          className={`w-full h-full flex items-center justify-center ${channel.image_url ? 'hidden' : ''}`}
        >
          <Radio className="w-8 h-8 text-gray-600" />
        </div>
      </div>

      {/* Channel Info */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-white text-sm line-clamp-2 group-hover:text-sxm-accent transition-colors">
            {channel.name}
          </h3>
          {channel.number && (
            <span className="text-xs text-gray-500 shrink-0">
              Ch {channel.number}
            </span>
          )}
        </div>
        {channel.genre && (
          <p className="text-xs text-gray-500 mt-1 line-clamp-1">
            {channel.genre}
          </p>
        )}
      </div>
    </Link>
  )
}

export default ChannelCard
